declare interface Env {
  // Durable Objects
  USERS: DurableObjectNamespace;
  AIRDROP: DurableObjectNamespace;
  FOUNDER_NFT: DurableObjectNamespace;

  // Environment variables
  DISCORD_BOT_TOKEN: string;
}

declare interface User {
  name: string;
}
