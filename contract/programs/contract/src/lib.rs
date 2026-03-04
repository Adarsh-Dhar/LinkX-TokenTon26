use anchor_lang::prelude::*;

declare_id!("24bMiJWS5z5PZTMMjQbmY4d5fbQTQbnmuc2dA2wZD57p");

#[program]
pub mod contract {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
