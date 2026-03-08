import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, Connection, SystemProgram } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

const DEVNET = "https://api.devnet.solana.com";

async function main() {
  // Setup connection
  const connection = new Connection(DEVNET, "confirmed");

  // Load wallet from ~/.config/solana/id.json
  const keypairPath = path.join(
    process.env.HOME || "/root",
    ".config/solana/id.json"
  );
  const secretKey = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const wallet = Keypair.fromSecretKey(Uint8Array.from(secretKey));

  console.log("Minter wallet:", wallet.publicKey.toBase58());

  // Target recipient
  const recipient = new PublicKey(
    "29btcGViz61Db5c1HTeEyw9p5rpDQG87VYNe1WupQnDL"
  );
  console.log("Recipient:", recipient.toBase58());

  // Get the IDL
  const idlPath = path.join(
    __dirname,
    "contract/target/idl/wrapped_token.json"
  );
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));

  // Program ID from deployment
  const WRAPPED_TOKEN_PROGRAM_ID = new PublicKey(
    "EJuPif8RkCMc3oSaLMn42Xx7rMRoFPMaNUnfmUU121YQ"
  );

  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(wallet),
    { commitment: "confirmed" }
  );

  const program = new anchor.Program(idl, WRAPPED_TOKEN_PROGRAM_ID, provider);

  // For minting, we need to know which mint to target.
  // Let's create or use an existing mint. First, create a mint if needed.
  let mintKeypair: Keypair;

  // Check if we have a stored mint keypair
  const mintPath = path.join(__dirname, ".mint_keypair.json");
  if (fs.existsSync(mintPath)) {
    const mintSecret = JSON.parse(fs.readFileSync(mintPath, "utf-8"));
    mintKeypair = Keypair.fromSecretKey(Uint8Array.from(mintSecret));
    console.log("Using existing mint:", mintKeypair.publicKey.toBase58());
  } else {
    // Create new mint
    mintKeypair = Keypair.generate();
    fs.writeFileSync(mintPath, JSON.stringify(Array.from(mintKeypair.secretKey)));
    console.log("Created new mint:", mintKeypair.publicKey.toBase58());

    // Initialize the mint/token config
    try {
      const configPda = PublicKey.findProgramAddressSync(
        [Buffer.from("token_config"), mintKeypair.publicKey.toBuffer()],
        WRAPPED_TOKEN_PROGRAM_ID
      )[0];

      const tx = await program.methods
        .initialize(
          "WSOL",  // symbol
          "Wrapped SOL",  // name
          9  // decimals (standard for SOL)
        )
        .accounts({
          payer: wallet.publicKey,
          owner: wallet.publicKey,
          bridge: wallet.publicKey,
          mint: mintKeypair.publicKey,
          tokenConfig: configPda,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([mintKeypair])
        .rpc();

      console.log("Initialized token config:", tx);
    } catch (err) {
      console.error("Error initializing:", err);
    }
  }

  // Now mint tokens to recipient
  try {
    const configPda = PublicKey.findProgramAddressSync(
      [Buffer.from("token_config"), mintKeypair.publicKey.toBuffer()],
      WRAPPED_TOKEN_PROGRAM_ID
    )[0];

    const recipientAta = getAssociatedTokenAddressSync(
      mintKeypair.publicKey,
      recipient
    );

    const amount = new anchor.BN(1_000_000_000); // 1 billion tokens (9 decimals = 1 token)

    const tx = await program.methods
      .mintTo(amount)
      .accounts({
        authority: wallet.publicKey,
        tokenConfig: configPda,
        mint: mintKeypair.publicKey,
        recipientAta: recipientAta,
        recipient: recipient,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("✅ Minted tokens successfully!");
    console.log("Transaction:", tx);
    console.log(
      "Minted 1,000,000,000 tokens to:",
      recipient.toBase58()
    );
  } catch (err) {
    console.error("Error minting tokens:", err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
