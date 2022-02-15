declare interface Env {
  // Durable Objects
  DISCORD: DurableObjectNamespace;
  TWITTER: DurableObjectNamespace;
  NFTDROP: DurableObjectNamespace;

  // Environment variables
  DISCORD_BOT_TOKEN: string;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  TWITTER_BEARER_TOKEN: string;
  CONSUMER_KEY: string;
  CONSUMER_SECRET: string;
  NEAR_KEY_PAIR: string;
}
