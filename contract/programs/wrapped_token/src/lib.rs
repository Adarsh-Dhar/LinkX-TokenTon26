/// wrapped_token — Solana/Anchor equivalent of:
///   WrappedERC20.sol  (bridge-controlled mint/burn)
///   ModuleCRC20.sol   (owner-auth mint/burn, named denom)
///   TestWXTZ.sol      (owner-mintable test token)
///   WXTZ.sol / USDC.sol (specific wrapped tokens)
///
/// Design:
///   • Each "token" is an SPL Mint.  The Anchor program manages a
///     `TokenConfig` PDA that stores metadata and authority rules.
///   • Two authority modes (mirrors the EVM contracts):
///       BridgeControlled – only the stored `bridge` key can mint/burn
///       OwnerControlled  – only the stored `owner` key can mint/burn
///   • Minting / burning delegate to the SPL Token CPI.
///   • The SPL Mint's `mint_authority` is set to the `token_config` PDA
///     so the program (not an EOA) is the sole on-chain authority.

use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Burn, Mint, MintTo, Token, TokenAccount},
};

declare_id!("WTknDR7bGXpFiS8DYgJf3Yp9vLuKqXoiVb3YkTRN8G3");

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

pub const CONFIG_SEED: &[u8] = b"token_config";
pub const MAX_SYMBOL_LEN: usize = 32;
pub const MAX_NAME_LEN: usize = 64;

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

/// Mirrors the metadata stored in WrappedERC20 / ModuleCRC20 / DSToken.
#[account]
pub struct TokenConfig {
    /// The SPL Mint this config governs.
    pub mint: Pubkey,

    /// Authority mode.
    pub mode: AuthorityMode,

    /// The bridge address (for BridgeControlled mode).
    pub bridge: Pubkey,

    /// The owner address (for OwnerControlled mode).
    pub owner: Pubkey,

    /// Whether minting/burning is halted (mirrors DSToken::stopped).
    pub stopped: bool,

    /// Token symbol (mirrors DSToken::symbol / ModuleCRC20::denom).
    pub symbol: [u8; MAX_SYMBOL_LEN],
    pub symbol_len: u8,

    /// Human-readable name.
    pub name: [u8; MAX_NAME_LEN],
    pub name_len: u8,

    /// Number of decimals – immutable after init.
    pub decimals: u8,

    /// Bump for the PDA.
    pub bump: u8,
}

impl Default for TokenConfig {
    fn default() -> Self {
        Self {
            mint: Pubkey::default(),
            mode: AuthorityMode::default(),
            bridge: Pubkey::default(),
            owner: Pubkey::default(),
            stopped: false,
            symbol: [0u8; MAX_SYMBOL_LEN],
            symbol_len: 0,
            name: [0u8; MAX_NAME_LEN],
            name_len: 0,
            decimals: 0,
            bump: 0,
        }
    }
}

impl TokenConfig {
    pub const LEN: usize = 8   // discriminator
        + 32                   // mint
        + 1                    // mode
        + 32                   // bridge
        + 32                   // owner
        + 1                    // stopped
        + MAX_SYMBOL_LEN + 1   // symbol + len
        + MAX_NAME_LEN   + 1   // name + len
        + 1                    // decimals
        + 1;                   // bump

    pub fn symbol_str(&self) -> &str {
        let end = self.symbol_len as usize;
        std::str::from_utf8(&self.symbol[..end]).unwrap_or("?")
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Default)]
pub enum AuthorityMode {
    #[default]
    BridgeControlled, // WrappedERC20 / WXTZ / USDC
    OwnerControlled,  // ModuleCRC20 / TestWXTZ / DSToken
}

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

#[error_code]
pub enum TokenError {
    #[msg("Caller is not the bridge")]
    NotBridge,
    #[msg("Caller is not the owner")]
    NotOwner,
    #[msg("Token is stopped")]
    Stopped,
    #[msg("Symbol too long (max 32 bytes)")]
    SymbolTooLong,
    #[msg("Name too long (max 64 bytes)")]
    NameTooLong,
    #[msg("Invalid bridge address (zero address)")]
    InvalidBridge,
    #[msg("Overflow in arithmetic")]
    Overflow,
}

// ─────────────────────────────────────────────────────────────────────────────
// Program
// ─────────────────────────────────────────────────────────────────────────────

#[program]
pub mod wrapped_token {
    use super::*;

    // ── Initializers ─────────────────────────────────────────────────────────

    /// Create a bridge-controlled wrapped token.
    /// Mirrors: `WrappedERC20` constructor – only `bridge` can mint/burn.
    ///
    /// Example tokens: WXTZ, USDC
    pub fn initialize_bridge_token(
        ctx: Context<InitializeBridgeToken>,
        symbol: String,
        name: String,
        decimals: u8,
    ) -> Result<()> {
        require!(symbol.len() <= MAX_SYMBOL_LEN, TokenError::SymbolTooLong);
        require!(name.len() <= MAX_NAME_LEN, TokenError::NameTooLong);
        require!(
            ctx.accounts.bridge.key() != Pubkey::default(),
            TokenError::InvalidBridge
        );

        let cfg = &mut ctx.accounts.token_config;
        cfg.mint = ctx.accounts.mint.key();
        cfg.mode = AuthorityMode::BridgeControlled;
        cfg.bridge = ctx.accounts.bridge.key();
        cfg.owner = Pubkey::default();
        cfg.stopped = false;
        cfg.decimals = decimals;
        cfg.bump = ctx.bumps.token_config;

        write_fixed(&mut cfg.symbol, &symbol);
        cfg.symbol_len = symbol.len() as u8;
        write_fixed(&mut cfg.name, &name);
        cfg.name_len = name.len() as u8;

        msg!(
            "Initialized bridge-controlled token: {} ({}) decimals={}",
            name,
            symbol,
            decimals
        );
        Ok(())
    }

    /// Create an owner-controlled token.
    /// Mirrors: `ModuleCRC20` / `TestWXTZ` / `DSToken` – only `owner` can mint/burn.
    pub fn initialize_owner_token(
        ctx: Context<InitializeOwnerToken>,
        symbol: String,
        name: String,
        decimals: u8,
        initial_supply: u64,
    ) -> Result<()> {
        require!(symbol.len() <= MAX_SYMBOL_LEN, TokenError::SymbolTooLong);
        require!(name.len() <= MAX_NAME_LEN, TokenError::NameTooLong);

        let cfg = &mut ctx.accounts.token_config;
        cfg.mint = ctx.accounts.mint.key();
        cfg.mode = AuthorityMode::OwnerControlled;
        cfg.bridge = Pubkey::default();
        cfg.owner = ctx.accounts.owner.key();
        cfg.stopped = false;
        cfg.decimals = decimals;
        cfg.bump = ctx.bumps.token_config;

        write_fixed(&mut cfg.symbol, &symbol);
        cfg.symbol_len = symbol.len() as u8;
        write_fixed(&mut cfg.name, &name);
        cfg.name_len = name.len() as u8;

        // Mint initial supply to owner's ATA (mirrors TestWXTZ constructor)
        if initial_supply > 0 {
            let mint_key = ctx.accounts.mint.key();
            let seeds: &[&[u8]] = &[CONFIG_SEED, mint_key.as_ref(), &[cfg.bump]];
            let signer = &[seeds];

            token::mint_to(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    MintTo {
                        mint: ctx.accounts.mint.to_account_info(),
                        to: ctx.accounts.owner_ata.to_account_info(),
                        authority: ctx.accounts.token_config.to_account_info(),
                    },
                    signer,
                ),
                initial_supply,
            )?;
        }

        msg!(
            "Initialized owner-controlled token: {} ({}) decimals={} initial_supply={}",
            name,
            symbol,
            decimals,
            initial_supply
        );
        Ok(())
    }

    // ── Mint ─────────────────────────────────────────────────────────────────

    /// Mint tokens to any recipient.
    /// Bridge mode  → caller must be `token_config.bridge`
    /// Owner mode   → caller must be `token_config.owner`
    /// Mirrors: `WrappedERC20::mint` / `ModuleCRC20::mint`
    pub fn mint_to(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
        let cfg = &ctx.accounts.token_config;

        require!(!cfg.stopped, TokenError::Stopped);
        check_authority(cfg, &ctx.accounts.authority.key())?;

        let mint_key = cfg.mint;
        let bump = cfg.bump;
        let seeds: &[&[u8]] = &[CONFIG_SEED, mint_key.as_ref(), &[bump]];
        let signer = &[seeds];

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.recipient_ata.to_account_info(),
                    authority: ctx.accounts.token_config.to_account_info(),
                },
                signer,
            ),
            amount,
        )?;

        emit!(MintEvent {
            mint: mint_key,
            recipient: ctx.accounts.recipient_ata.owner,
            amount,
        });
        Ok(())
    }

    /// Burn tokens from an account.
    /// Bridge mode  → caller must be `token_config.bridge`
    /// Owner mode   → caller must be `token_config.owner`
    /// Mirrors: `WrappedERC20::burn` / `ModuleCRC20::burn`
    pub fn burn_from(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
        let cfg = &ctx.accounts.token_config;

        require!(!cfg.stopped, TokenError::Stopped);
        check_authority(cfg, &ctx.accounts.authority.key())?;

        let mint_key = cfg.mint;
        let bump = cfg.bump;
        let seeds: &[&[u8]] = &[CONFIG_SEED, mint_key.as_ref(), &[bump]];
        let signer = &[seeds];

        // The token_config PDA is the mint_authority; we use delegate-burn pattern:
        // authority signs as delegate on the token account.
        token::burn(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.mint.to_account_info(),
                    from: ctx.accounts.from_ata.to_account_info(),
                    authority: ctx.accounts.token_config.to_account_info(),
                },
                signer,
            ),
            amount,
        )?;

        emit!(BurnEvent {
            mint: mint_key,
            from: ctx.accounts.from_ata.owner,
            amount,
        });
        Ok(())
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    /// Stop all minting and burning. Mirrors: `DSToken::stop`.
    pub fn stop(ctx: Context<AdminAction>) -> Result<()> {
        let cfg = &mut ctx.accounts.token_config;
        require_owner_or_bridge(cfg, &ctx.accounts.authority.key())?;
        cfg.stopped = true;
        emit!(StopEvent { mint: cfg.mint });
        Ok(())
    }

    /// Resume minting and burning. Mirrors: `DSToken::start`.
    pub fn start(ctx: Context<AdminAction>) -> Result<()> {
        let cfg = &mut ctx.accounts.token_config;
        require_owner_or_bridge(cfg, &ctx.accounts.authority.key())?;
        cfg.stopped = false;
        emit!(StartEvent { mint: cfg.mint });
        Ok(())
    }

    /// Transfer ownership. Mirrors: `DSAuth::setOwner`.
    pub fn set_owner(ctx: Context<SetOwner>, new_owner: Pubkey) -> Result<()> {
        let cfg = &mut ctx.accounts.token_config;
        require!(cfg.mode == AuthorityMode::OwnerControlled, TokenError::NotOwner);
        require!(
            cfg.owner == ctx.accounts.current_owner.key(),
            TokenError::NotOwner
        );
        cfg.owner = new_owner;
        msg!("Owner updated to {}", new_owner);
        Ok(())
    }

    /// Update the bridge address.
    pub fn set_bridge(ctx: Context<SetBridge>, new_bridge: Pubkey) -> Result<()> {
        let cfg = &mut ctx.accounts.token_config;
        require!(
            cfg.mode == AuthorityMode::BridgeControlled,
            TokenError::NotBridge
        );
        require!(
            cfg.bridge == ctx.accounts.current_bridge.key(),
            TokenError::NotBridge
        );
        require!(new_bridge != Pubkey::default(), TokenError::InvalidBridge);
        cfg.bridge = new_bridge;
        msg!("Bridge updated to {}", new_bridge);
        Ok(())
    }

    /// Update the token name. Mirrors: `DSToken::setName`.
    pub fn set_name(ctx: Context<AdminAction>, new_name: String) -> Result<()> {
        require!(new_name.len() <= MAX_NAME_LEN, TokenError::NameTooLong);
        let cfg = &mut ctx.accounts.token_config;
        require_owner_or_bridge(cfg, &ctx.accounts.authority.key())?;
        write_fixed(&mut cfg.name, &new_name);
        cfg.name_len = new_name.len() as u8;
        Ok(())
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Account contexts
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(symbol: String, name: String, decimals: u8)]
pub struct InitializeBridgeToken<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The bridge authority – its address is stored in TokenConfig.
    /// CHECK: we only store the key; authority is enforced at mint/burn time.
    pub bridge: UncheckedAccount<'info>,

    /// The new SPL Mint. Created by this instruction via init.
    #[account(
        init,
        payer = payer,
        mint::decimals = decimals,
        mint::authority = token_config,
        mint::freeze_authority = token_config,
    )]
    pub mint: Account<'info, Mint>,

    /// PDA that governs the mint.
    #[account(
        init,
        payer = payer,
        space = TokenConfig::LEN,
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump,
    )]
    pub token_config: Account<'info, TokenConfig>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(symbol: String, name: String, decimals: u8, initial_supply: u64)]
pub struct InitializeOwnerToken<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The initial owner (msg.sender in Solidity).
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = payer,
        mint::decimals = decimals,
        mint::authority = token_config,
        mint::freeze_authority = token_config,
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = payer,
        space = TokenConfig::LEN,
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump,
    )]
    pub token_config: Account<'info, TokenConfig>,

    /// Owner's associated token account for initial supply.
    #[account(
        init,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = owner,
    )]
    pub owner_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct MintTokens<'info> {
    /// The bridge or owner – must match what is stored in token_config.
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = token_config.bump,
    )]
    pub token_config: Account<'info, TokenConfig>,

    #[account(mut, address = token_config.mint)]
    pub mint: Account<'info, Mint>,

    /// The recipient's token account.
    #[account(
        init,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = recipient,
    )]
    pub recipient_ata: Account<'info, TokenAccount>,

    /// CHECK: we only need the key to derive/init the ATA.
    pub recipient: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BurnTokens<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = token_config.bump,
    )]
    pub token_config: Account<'info, TokenConfig>,

    #[account(mut, address = token_config.mint)]
    pub mint: Account<'info, Mint>,

    /// Token account to burn from.
    #[account(
        mut,
        token::mint = mint,
    )]
    pub from_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct AdminAction<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, token_config.mint.as_ref()],
        bump = token_config.bump,
    )]
    pub token_config: Account<'info, TokenConfig>,
}

#[derive(Accounts)]
pub struct SetOwner<'info> {
    pub current_owner: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, token_config.mint.as_ref()],
        bump = token_config.bump,
    )]
    pub token_config: Account<'info, TokenConfig>,
}

#[derive(Accounts)]
pub struct SetBridge<'info> {
    pub current_bridge: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, token_config.mint.as_ref()],
        bump = token_config.bump,
    )]
    pub token_config: Account<'info, TokenConfig>,
}

// ─────────────────────────────────────────────────────────────────────────────
// Events
// ─────────────────────────────────────────────────────────────────────────────

#[event]
pub struct MintEvent {
    pub mint: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
}

#[event]
pub struct BurnEvent {
    pub mint: Pubkey,
    pub from: Pubkey,
    pub amount: u64,
}

#[event]
pub struct StopEvent {
    pub mint: Pubkey,
}

#[event]
pub struct StartEvent {
    pub mint: Pubkey,
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

fn check_authority(cfg: &TokenConfig, caller: &Pubkey) -> Result<()> {
    match cfg.mode {
        AuthorityMode::BridgeControlled => {
            require!(cfg.bridge == *caller, TokenError::NotBridge);
        }
        AuthorityMode::OwnerControlled => {
            require!(cfg.owner == *caller, TokenError::NotOwner);
        }
    }
    Ok(())
}

fn require_owner_or_bridge(cfg: &TokenConfig, caller: &Pubkey) -> Result<()> {
    let ok = match cfg.mode {
        AuthorityMode::BridgeControlled => cfg.bridge == *caller,
        AuthorityMode::OwnerControlled => cfg.owner == *caller,
    };
    require!(ok, TokenError::NotOwner);
    Ok(())
}

fn write_fixed(buf: &mut [u8], s: &str) {
    let bytes = s.as_bytes();
    let copy_len = bytes.len().min(buf.len());
    buf[..copy_len].copy_from_slice(&bytes[..copy_len]);
}