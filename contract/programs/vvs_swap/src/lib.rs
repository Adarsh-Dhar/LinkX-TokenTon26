/// vvs_swap — Solana/Anchor equivalent of:
///   VVSFactory.sol   — pool registry
///   VVSPair.sol      — constant-product AMM pool (x·y = k, 0.3 % fee)
///   VVSRouter.sol    — user-facing swap / liquidity helpers
///   VVSLibrary.sol   — pure math (quote, getAmountOut, getAmountIn)
///
/// Mapping of concepts
/// ───────────────────
///   EVM `address`            → Solana `Pubkey`
///   EVM contract storage     → Anchor `#[account]` PDA
///   EVM `msg.sender`         → `Signer` in the accounts list
///   EVM `ERC20.transfer`     → SPL Token CPI
///   Pair identified by       → PDA(seeds=[b"pool", token0, token1])
///   LP tokens                → SPL Mint (PDA authority)
///
/// Programs are intentionally merged into one to simplify cross-program calls.
/// In a production system you'd split factory / pair / router.

use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{
        self, Burn, Mint, MintTo, Token, TokenAccount, Transfer,
    },
};

declare_id!("VVSWxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx2222");

// ─────────────────────────────────────────────────────────────────────────────
// Seed constants
// ─────────────────────────────────────────────────────────────────────────────

pub const FACTORY_SEED: &[u8] = b"factory";
pub const POOL_SEED:    &[u8] = b"pool";
pub const LP_MINT_SEED: &[u8] = b"lp_mint";
pub const VAULT0_SEED:  &[u8] = b"vault0";
pub const VAULT1_SEED:  &[u8] = b"vault1";

/// Minimum liquidity locked on first deposit (mirrors Uniswap V2).
pub const MINIMUM_LIQUIDITY: u64 = 1_000;

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

#[error_code]
pub enum AmmError {
    #[msg("Identical token addresses")]
    IdenticalAddresses,
    #[msg("Pool already exists")]
    PoolExists,
    #[msg("Insufficient output amount")]
    InsufficientOutputAmount,
    #[msg("Insufficient input amount")]
    InsufficientInputAmount,
    #[msg("Insufficient liquidity")]
    InsufficientLiquidity,
    #[msg("Insufficient A amount")]
    InsufficientAmountA,
    #[msg("Insufficient B amount")]
    InsufficientAmountB,
    #[msg("Excessive input amount")]
    ExcessiveInputAmount,
    #[msg("Deadline exceeded")]
    Expired,
    #[msg("Invalid swap path")]
    InvalidPath,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Zero liquidity minted")]
    ZeroLiquidity,
    #[msg("Not factory admin")]
    NotAdmin,
}

// ─────────────────────────────────────────────────────────────────────────────
// State accounts
// ─────────────────────────────────────────────────────────────────────────────

/// Global factory state. Mirrors `VVSFactory` storage.
#[account]
pub struct Factory {
    /// Admin / fee setter.
    pub admin: Pubkey,
    /// Optional fee recipient.
    pub fee_to: Pubkey,
    /// Total pools created.
    pub pool_count: u64,
    pub bump: u8,
}

impl Factory {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 1;
}

/// Per-pool state. Mirrors `VVSPair` storage.
/// PDA seeds: [POOL_SEED, token0_mint, token1_mint]
/// token0 < token1 (sorted by Pubkey).
#[account]
pub struct Pool {
    /// Factory that created this pool.
    pub factory: Pubkey,
    /// Sorted token mints.
    pub token0_mint: Pubkey,
    pub token1_mint: Pubkey,
    /// Vault token accounts (PDAs).
    pub vault0: Pubkey,
    pub vault1: Pubkey,
    /// LP token mint.
    pub lp_mint: Pubkey,

    // Reserves — kept in sync after every operation.
    pub reserve0: u64,
    pub reserve1: u64,

    /// Total LP supply (we track manually; SPL mint is authoritative).
    pub lp_supply: u64,

    /// Timestamp of last reserve update.
    pub block_timestamp_last: i64,

    pub bump: u8,
    pub lp_mint_bump: u8,
    pub vault0_bump: u8,
    pub vault1_bump: u8,
}

impl Pool {
    pub const LEN: usize = 8
        + 32 + 32 + 32 + 32 + 32 + 32  // pubkeys
        + 8 + 8                          // reserves
        + 8                              // lp_supply
        + 8                              // timestamp
        + 4;                             // bumps
}

// ─────────────────────────────────────────────────────────────────────────────
// Program
// ─────────────────────────────────────────────────────────────────────────────

#[program]
pub mod vvs_swap {
    use super::*;

    // ── Factory init ─────────────────────────────────────────────────────────

    /// One-time factory setup. Call once after deployment.
    pub fn initialize_factory(ctx: Context<InitializeFactory>) -> Result<()> {
        let factory = &mut ctx.accounts.factory;
        factory.admin = ctx.accounts.admin.key();
        factory.fee_to = Pubkey::default();
        factory.pool_count = 0;
        factory.bump = ctx.bumps.factory;
        msg!("Factory initialized. Admin: {}", factory.admin);
        Ok(())
    }

    pub fn set_fee_to(ctx: Context<AdminOnly>, fee_to: Pubkey) -> Result<()> {
        require!(
            ctx.accounts.admin.key() == ctx.accounts.factory.admin,
            AmmError::NotAdmin
        );
        ctx.accounts.factory.fee_to = fee_to;
        Ok(())
    }

    // ── Create pool (= createPair) ────────────────────────────────────────────

    /// Creates a new liquidity pool for two tokens.
    /// Mirrors `VVSFactory::createPair`.
    pub fn create_pool(ctx: Context<CreatePool>) -> Result<()> {
        require!(
            ctx.accounts.token0_mint.key() != ctx.accounts.token1_mint.key(),
            AmmError::IdenticalAddresses
        );

        let pool = &mut ctx.accounts.pool;
        pool.factory = ctx.accounts.factory.key();
        pool.token0_mint = ctx.accounts.token0_mint.key();
        pool.token1_mint = ctx.accounts.token1_mint.key();
        pool.vault0 = ctx.accounts.vault0.key();
        pool.vault1 = ctx.accounts.vault1.key();
        pool.lp_mint = ctx.accounts.lp_mint.key();
        pool.reserve0 = 0;
        pool.reserve1 = 0;
        pool.lp_supply = 0;
        pool.block_timestamp_last = Clock::get()?.unix_timestamp;
        pool.bump = ctx.bumps.pool;
        pool.lp_mint_bump = ctx.bumps.lp_mint;
        pool.vault0_bump = ctx.bumps.vault0;
        pool.vault1_bump = ctx.bumps.vault1;

        ctx.accounts.factory.pool_count =
            ctx.accounts.factory.pool_count.checked_add(1).unwrap();

        emit!(PoolCreated {
            token0: pool.token0_mint,
            token1: pool.token1_mint,
            pool: pool.key(),
        });
        Ok(())
    }

    // ── Add liquidity ─────────────────────────────────────────────────────────

    /// Deposit token0 + token1, receive LP tokens.
    /// Mirrors `VVSRouter::addLiquidity`.
    pub fn add_liquidity(
        ctx: Context<AddLiquidity>,
        amount0_desired: u64,
        amount1_desired: u64,
        amount0_min: u64,
        amount1_min: u64,
        deadline: i64,
    ) -> Result<()> {
        check_deadline(deadline)?;

        let pool = &ctx.accounts.pool;
        let r0 = pool.reserve0;
        let r1 = pool.reserve1;

        // Compute optimal amounts (mirrors _addLiquidity logic).
        let (amount0, amount1) = if r0 == 0 && r1 == 0 {
            (amount0_desired, amount1_desired)
        } else {
            let opt1 = quote(amount0_desired, r0, r1)?;
            if opt1 <= amount1_desired {
                require!(opt1 >= amount1_min, AmmError::InsufficientAmountB);
                (amount0_desired, opt1)
            } else {
                let opt0 = quote(amount1_desired, r1, r0)?;
                require!(opt0 <= amount0_desired, AmmError::Overflow);
                require!(opt0 >= amount0_min, AmmError::InsufficientAmountA);
                (opt0, amount1_desired)
            }
        };

        // Transfer tokens from user into vaults.
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token0.to_account_info(),
                    to: ctx.accounts.vault0.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount0,
        )?;
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token1.to_account_info(),
                    to: ctx.accounts.vault1.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount1,
        )?;

        // Compute LP tokens to mint.
        let pool = &ctx.accounts.pool;
        let lp_supply = pool.lp_supply;

        let liquidity = if lp_supply == 0 {
            // First deposit: geometric mean minus MINIMUM_LIQUIDITY.
            let liq = integer_sqrt(
                (amount0 as u128)
                    .checked_mul(amount1 as u128)
                    .ok_or(AmmError::Overflow)?,
            ) as u64;
            require!(liq > MINIMUM_LIQUIDITY, AmmError::ZeroLiquidity);
            liq - MINIMUM_LIQUIDITY
        } else {
            let liq0 = (amount0 as u128)
                .checked_mul(lp_supply as u128)
                .ok_or(AmmError::Overflow)?
                / pool.reserve0 as u128;
            let liq1 = (amount1 as u128)
                .checked_mul(lp_supply as u128)
                .ok_or(AmmError::Overflow)?
                / pool.reserve1 as u128;
            liq0.min(liq1) as u64
        };

        require!(liquidity > 0, AmmError::ZeroLiquidity);

        // Mint LP tokens to user.
        let pool_key = pool.key();
        let t0 = pool.token0_mint;
        let t1 = pool.token1_mint;
        let lp_bump = pool.lp_mint_bump;
        let lp_seeds: &[&[u8]] = &[LP_MINT_SEED, t0.as_ref(), t1.as_ref(), &[lp_bump]];
        let lp_signer = &[lp_seeds];

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.lp_mint.to_account_info(),
                    to: ctx.accounts.user_lp.to_account_info(),
                    authority: ctx.accounts.lp_mint.to_account_info(),
                },
                lp_signer,
            ),
            liquidity,
        )?;

        // Update pool state.
        let pool = &mut ctx.accounts.pool;
        pool.reserve0 = pool.reserve0.checked_add(amount0).ok_or(AmmError::Overflow)?;
        pool.reserve1 = pool.reserve1.checked_add(amount1).ok_or(AmmError::Overflow)?;
        pool.lp_supply = pool.lp_supply.checked_add(liquidity).ok_or(AmmError::Overflow)?;
        pool.block_timestamp_last = Clock::get()?.unix_timestamp;

        emit!(LiquidityAdded {
            pool: pool_key,
            user: ctx.accounts.user.key(),
            amount0,
            amount1,
            liquidity,
        });
        Ok(())
    }

    // ── Remove liquidity ──────────────────────────────────────────────────────

    /// Burn LP tokens, receive back token0 + token1.
    /// Mirrors `VVSRouter::removeLiquidity`.
    pub fn remove_liquidity(
        ctx: Context<RemoveLiquidity>,
        liquidity: u64,
        amount0_min: u64,
        amount1_min: u64,
        deadline: i64,
    ) -> Result<()> {
        check_deadline(deadline)?;

        let pool = &ctx.accounts.pool;
        let lp_supply = pool.lp_supply;
        require!(lp_supply > 0, AmmError::InsufficientLiquidity);

        // Proportional amounts out.
        let amount0 = (liquidity as u128)
            .checked_mul(pool.reserve0 as u128)
            .ok_or(AmmError::Overflow)?
            / lp_supply as u128;
        let amount1 = (liquidity as u128)
            .checked_mul(pool.reserve1 as u128)
            .ok_or(AmmError::Overflow)?
            / lp_supply as u128;

        let amount0 = amount0 as u64;
        let amount1 = amount1 as u64;

        require!(amount0 >= amount0_min, AmmError::InsufficientAmountA);
        require!(amount1 >= amount1_min, AmmError::InsufficientAmountB);

        // Burn LP tokens from user.
        let t0 = pool.token0_mint;
        let t1 = pool.token1_mint;
        let lp_bump = pool.lp_mint_bump;
        let lp_seeds: &[&[u8]] = &[LP_MINT_SEED, t0.as_ref(), t1.as_ref(), &[lp_bump]];
        let lp_signer = &[lp_seeds];

        token::burn(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.lp_mint.to_account_info(),
                    from: ctx.accounts.user_lp.to_account_info(),
                    authority: ctx.accounts.lp_mint.to_account_info(),
                },
                lp_signer,
            ),
            liquidity,
        )?;

        // Transfer tokens from vaults to user.
        let v0_bump = pool.vault0_bump;
        let v1_bump = pool.vault1_bump;
        let pool_key = pool.key();

        let vault0_seeds: &[&[u8]] = &[VAULT0_SEED, pool_key.as_ref(), &[v0_bump]];
        let vault0_signer = &[vault0_seeds];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault0.to_account_info(),
                    to: ctx.accounts.user_token0.to_account_info(),
                    authority: ctx.accounts.vault0.to_account_info(),
                },
                vault0_signer,
            ),
            amount0,
        )?;

        let vault1_seeds: &[&[u8]] = &[VAULT1_SEED, pool_key.as_ref(), &[v1_bump]];
        let vault1_signer = &[vault1_seeds];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault1.to_account_info(),
                    to: ctx.accounts.user_token1.to_account_info(),
                    authority: ctx.accounts.vault1.to_account_info(),
                },
                vault1_signer,
            ),
            amount1,
        )?;

        // Update pool state.
        let pool = &mut ctx.accounts.pool;
        pool.reserve0 = pool.reserve0.checked_sub(amount0).ok_or(AmmError::Overflow)?;
        pool.reserve1 = pool.reserve1.checked_sub(amount1).ok_or(AmmError::Overflow)?;
        pool.lp_supply = pool.lp_supply.checked_sub(liquidity).ok_or(AmmError::Overflow)?;
        pool.block_timestamp_last = Clock::get()?.unix_timestamp;

        emit!(LiquidityRemoved {
            pool: pool_key,
            user: ctx.accounts.user.key(),
            amount0,
            amount1,
            liquidity,
        });
        Ok(())
    }

    // ── Swap exact tokens in → tokens out ─────────────────────────────────────

    /// Mirrors `VVSRouter::swapExactTokensForTokens` (single hop).
    /// For multi-hop you chain multiple swap calls or extend the path.
    pub fn swap_exact_in(
        ctx: Context<Swap>,
        amount_in: u64,
        amount_out_min: u64,
        zero_for_one: bool, // true  → sell token0, buy token1
        deadline: i64,
    ) -> Result<()> {
        check_deadline(deadline)?;

        let pool = &ctx.accounts.pool;
        let (reserve_in, reserve_out) = if zero_for_one {
            (pool.reserve0, pool.reserve1)
        } else {
            (pool.reserve1, pool.reserve0)
        };

        let amount_out = get_amount_out(amount_in, reserve_in, reserve_out)?;
        require!(amount_out >= amount_out_min, AmmError::InsufficientOutputAmount);

        execute_swap(
            ctx,
            amount_in,
            amount_out,
            zero_for_one,
        )?;

        Ok(())
    }

    /// Mirrors `VVSRouter::swapTokensForExactTokens` (single hop).
    pub fn swap_exact_out(
        ctx: Context<Swap>,
        amount_out: u64,
        amount_in_max: u64,
        zero_for_one: bool,
        deadline: i64,
    ) -> Result<()> {
        check_deadline(deadline)?;

        let pool = &ctx.accounts.pool;
        let (reserve_in, reserve_out) = if zero_for_one {
            (pool.reserve0, pool.reserve1)
        } else {
            (pool.reserve1, pool.reserve0)
        };

        let amount_in = get_amount_in(amount_out, reserve_in, reserve_out)?;
        require!(amount_in <= amount_in_max, AmmError::ExcessiveInputAmount);

        execute_swap(
            ctx,
            amount_in,
            amount_out,
            zero_for_one,
        )?;

        Ok(())
    }

    // ── View-like helpers (replicate VVSRouter/VVSLibrary pure functions) ─────

    /// `VVSLibrary::quote` — given amountA and reserves, return equivalent amountB.
    pub fn quote_amount(
        _ctx: Context<ViewOnly>,
        amount_a: u64,
        reserve_a: u64,
        reserve_b: u64,
    ) -> Result<u64> {
        quote(amount_a, reserve_a, reserve_b)
    }

    /// `VVSLibrary::getAmountOut` — given exact input, return max output.
    pub fn get_amount_out_view(
        _ctx: Context<ViewOnly>,
        amount_in: u64,
        reserve_in: u64,
        reserve_out: u64,
    ) -> Result<u64> {
        get_amount_out(amount_in, reserve_in, reserve_out)
    }

    /// `VVSLibrary::getAmountIn` — given exact output, return required input.
    pub fn get_amount_in_view(
        _ctx: Context<ViewOnly>,
        amount_out: u64,
        reserve_in: u64,
        reserve_out: u64,
    ) -> Result<u64> {
        get_amount_in(amount_out, reserve_in, reserve_out)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Account contexts
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializeFactory<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = Factory::LEN,
        seeds = [FACTORY_SEED],
        bump,
    )]
    pub factory: Account<'info, Factory>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [FACTORY_SEED], bump = factory.bump)]
    pub factory: Account<'info, Factory>,
}

/// Sorts two mint pubkeys so token0 < token1 (matches EVM sort-by-address).
/// Callers must pass mints pre-sorted.
#[derive(Accounts)]
pub struct CreatePool<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut, seeds = [FACTORY_SEED], bump = factory.bump)]
    pub factory: Account<'info, Factory>,

    /// Sorted: token0 < token1.
    pub token0_mint: Account<'info, Mint>,
    pub token1_mint: Account<'info, Mint>,

    /// Pool state PDA.
    #[account(
        init,
        payer = payer,
        space = Pool::LEN,
        seeds = [POOL_SEED, token0_mint.key().as_ref(), token1_mint.key().as_ref()],
        bump,
    )]
    pub pool: Account<'info, Pool>,

    /// LP token mint – authority is this account itself (PDA).
    #[account(
        init,
        payer = payer,
        mint::decimals = 6,
        mint::authority = lp_mint,
        seeds = [LP_MINT_SEED, token0_mint.key().as_ref(), token1_mint.key().as_ref()],
        bump,
    )]
    pub lp_mint: Account<'info, Mint>,

    /// Vault for token0 – authority is this account itself (PDA).
    #[account(
        init,
        payer = payer,
        token::mint = token0_mint,
        token::authority = vault0,
        seeds = [VAULT0_SEED, pool.key().as_ref()],
        bump,
    )]
    pub vault0: Account<'info, TokenAccount>,

    /// Vault for token1.
    #[account(
        init,
        payer = payer,
        token::mint = token1_mint,
        token::authority = vault1,
        seeds = [VAULT1_SEED, pool.key().as_ref()],
        bump,
    )]
    pub vault1: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct AddLiquidity<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [POOL_SEED, pool.token0_mint.as_ref(), pool.token1_mint.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,

    #[account(mut, address = pool.lp_mint,
        seeds = [LP_MINT_SEED, pool.token0_mint.as_ref(), pool.token1_mint.as_ref()],
        bump = pool.lp_mint_bump,
    )]
    pub lp_mint: Account<'info, Mint>,

    #[account(mut, address = pool.vault0,
        seeds = [VAULT0_SEED, pool.key().as_ref()],
        bump = pool.vault0_bump,
    )]
    pub vault0: Account<'info, TokenAccount>,

    #[account(mut, address = pool.vault1,
        seeds = [VAULT1_SEED, pool.key().as_ref()],
        bump = pool.vault1_bump,
    )]
    pub vault1: Account<'info, TokenAccount>,

    #[account(mut, token::mint = pool.token0_mint, token::authority = user)]
    pub user_token0: Account<'info, TokenAccount>,

    #[account(mut, token::mint = pool.token1_mint, token::authority = user)]
    pub user_token1: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = lp_mint,
        associated_token::authority = user,
    )]
    pub user_lp: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RemoveLiquidity<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [POOL_SEED, pool.token0_mint.as_ref(), pool.token1_mint.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,

    #[account(mut, address = pool.lp_mint,
        seeds = [LP_MINT_SEED, pool.token0_mint.as_ref(), pool.token1_mint.as_ref()],
        bump = pool.lp_mint_bump,
    )]
    pub lp_mint: Account<'info, Mint>,

    #[account(mut, address = pool.vault0,
        seeds = [VAULT0_SEED, pool.key().as_ref()],
        bump = pool.vault0_bump,
    )]
    pub vault0: Account<'info, TokenAccount>,

    #[account(mut, address = pool.vault1,
        seeds = [VAULT1_SEED, pool.key().as_ref()],
        bump = pool.vault1_bump,
    )]
    pub vault1: Account<'info, TokenAccount>,

    #[account(mut, token::mint = pool.token0_mint, token::authority = user)]
    pub user_token0: Account<'info, TokenAccount>,

    #[account(mut, token::mint = pool.token1_mint, token::authority = user)]
    pub user_token1: Account<'info, TokenAccount>,

    #[account(mut, token::mint = lp_mint, token::authority = user)]
    pub user_lp: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Swap<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [POOL_SEED, pool.token0_mint.as_ref(), pool.token1_mint.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,

    #[account(mut, address = pool.vault0,
        seeds = [VAULT0_SEED, pool.key().as_ref()],
        bump = pool.vault0_bump,
    )]
    pub vault0: Account<'info, TokenAccount>,

    #[account(mut, address = pool.vault1,
        seeds = [VAULT1_SEED, pool.key().as_ref()],
        bump = pool.vault1_bump,
    )]
    pub vault1: Account<'info, TokenAccount>,

    /// User's source token account.
    #[account(mut, token::mint = pool.token0_mint, token::authority = user)]
    pub user_token0: Account<'info, TokenAccount>,

    /// User's destination token account.
    #[account(mut, token::mint = pool.token1_mint, token::authority = user)]
    pub user_token1: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

/// Dummy context for view functions (no accounts needed on-chain).
#[derive(Accounts)]
pub struct ViewOnly<'info> {
    pub user: Signer<'info>,
}

// ─────────────────────────────────────────────────────────────────────────────
// Events
// ─────────────────────────────────────────────────────────────────────────────

#[event]
pub struct PoolCreated {
    pub token0: Pubkey,
    pub token1: Pubkey,
    pub pool: Pubkey,
}

#[event]
pub struct LiquidityAdded {
    pub pool: Pubkey,
    pub user: Pubkey,
    pub amount0: u64,
    pub amount1: u64,
    pub liquidity: u64,
}

#[event]
pub struct LiquidityRemoved {
    pub pool: Pubkey,
    pub user: Pubkey,
    pub amount0: u64,
    pub amount1: u64,
    pub liquidity: u64,
}

#[event]
pub struct SwapEvent {
    pub pool: Pubkey,
    pub user: Pubkey,
    pub amount_in: u64,
    pub amount_out: u64,
    pub zero_for_one: bool,
}

// ─────────────────────────────────────────────────────────────────────────────
// AMM math  (VVSLibrary equivalents — pure, no state)
// ─────────────────────────────────────────────────────────────────────────────

/// `VVSLibrary::quote` — proportional price, no fee.
pub fn quote(amount_a: u64, reserve_a: u64, reserve_b: u64) -> Result<u64> {
    require!(amount_a > 0, AmmError::InsufficientInputAmount);
    require!(reserve_a > 0 && reserve_b > 0, AmmError::InsufficientLiquidity);
    let result = (amount_a as u128)
        .checked_mul(reserve_b as u128)
        .ok_or(AmmError::Overflow)?
        / reserve_a as u128;
    Ok(result as u64)
}

/// `VVSLibrary::getAmountOut` — constant-product with 0.3 % fee.
///   amountOut = (amountIn * 997 * reserveOut)
///             / (reserveIn * 1000 + amountIn * 997)
pub fn get_amount_out(amount_in: u64, reserve_in: u64, reserve_out: u64) -> Result<u64> {
    require!(amount_in > 0, AmmError::InsufficientInputAmount);
    require!(reserve_in > 0 && reserve_out > 0, AmmError::InsufficientLiquidity);

    let amount_in_with_fee = (amount_in as u128).checked_mul(997).ok_or(AmmError::Overflow)?;
    let numerator = amount_in_with_fee
        .checked_mul(reserve_out as u128)
        .ok_or(AmmError::Overflow)?;
    let denominator = (reserve_in as u128)
        .checked_mul(1000)
        .ok_or(AmmError::Overflow)?
        .checked_add(amount_in_with_fee)
        .ok_or(AmmError::Overflow)?;

    Ok((numerator / denominator) as u64)
}

/// `VVSLibrary::getAmountIn` — required input for exact output.
///   amountIn = (reserveIn * amountOut * 1000)
///            / ((reserveOut - amountOut) * 997) + 1
pub fn get_amount_in(amount_out: u64, reserve_in: u64, reserve_out: u64) -> Result<u64> {
    require!(amount_out > 0, AmmError::InsufficientOutputAmount);
    require!(reserve_in > 0 && reserve_out > 0, AmmError::InsufficientLiquidity);
    require!(amount_out < reserve_out, AmmError::InsufficientLiquidity);

    let numerator = (reserve_in as u128)
        .checked_mul(amount_out as u128)
        .ok_or(AmmError::Overflow)?
        .checked_mul(1000)
        .ok_or(AmmError::Overflow)?;
    let denominator = (reserve_out as u128)
        .checked_sub(amount_out as u128)
        .ok_or(AmmError::Overflow)?
        .checked_mul(997)
        .ok_or(AmmError::Overflow)?;

    Ok((numerator / denominator) as u64 + 1)
}

/// Integer square root (Babylonian method, same as VVSFactory Math library).
pub fn integer_sqrt(y: u128) -> u128 {
    if y > 3 {
        let mut z = y;
        let mut x = y / 2 + 1;
        while x < z {
            z = x;
            x = (y / x + x) / 2;
        }
        z
    } else if y != 0 {
        1
    } else {
        0
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

fn check_deadline(deadline: i64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(deadline >= now, AmmError::Expired);
    Ok(())
}

/// Core swap execution used by both swap_exact_in and swap_exact_out.
fn execute_swap<'info>(
    ctx: Context<Swap<'info>>,
    amount_in: u64,
    amount_out: u64,
    zero_for_one: bool,
) -> Result<()> {
    let pool = &ctx.accounts.pool;
    let pool_key = pool.key();
    let v0_bump = pool.vault0_bump;
    let v1_bump = pool.vault1_bump;

    // Transfer input token from user into vault.
    if zero_for_one {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token0.to_account_info(),
                    to: ctx.accounts.vault0.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount_in,
        )?;
    } else {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token1.to_account_info(),
                    to: ctx.accounts.vault1.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount_in,
        )?;
    }

    // Transfer output token from vault to user.
    if zero_for_one {
        let vault1_seeds: &[&[u8]] = &[VAULT1_SEED, pool_key.as_ref(), &[v1_bump]];
        let vault1_signer = &[vault1_seeds];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault1.to_account_info(),
                    to: ctx.accounts.user_token1.to_account_info(),
                    authority: ctx.accounts.vault1.to_account_info(),
                },
                vault1_signer,
            ),
            amount_out,
        )?;
    } else {
        let vault0_seeds: &[&[u8]] = &[VAULT0_SEED, pool_key.as_ref(), &[v0_bump]];
        let vault0_signer = &[vault0_seeds];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault0.to_account_info(),
                    to: ctx.accounts.user_token0.to_account_info(),
                    authority: ctx.accounts.vault0.to_account_info(),
                },
                vault0_signer,
            ),
            amount_out,
        )?;
    }

    // Update reserves.
    let pool = &mut ctx.accounts.pool;
    if zero_for_one {
        pool.reserve0 = pool.reserve0.checked_add(amount_in).ok_or(AmmError::Overflow)?;
        pool.reserve1 = pool.reserve1.checked_sub(amount_out).ok_or(AmmError::Overflow)?;
    } else {
        pool.reserve1 = pool.reserve1.checked_add(amount_in).ok_or(AmmError::Overflow)?;
        pool.reserve0 = pool.reserve0.checked_sub(amount_out).ok_or(AmmError::Overflow)?;
    }
    pool.block_timestamp_last = Clock::get()?.unix_timestamp;

    emit!(SwapEvent {
        pool: pool_key,
        user: ctx.accounts.user.key(),
        amount_in,
        amount_out,
        zero_for_one,
    });
    Ok(())
}