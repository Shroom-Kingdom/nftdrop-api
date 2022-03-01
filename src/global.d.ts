declare interface Env {
  // Durable Objects
  DISCORD: DurableObjectNamespace;
  TWITTER: DurableObjectNamespace;
  NFTDROP: DurableObjectNamespace;
  NEAR: DurableObjectNamespace;

  DISCORD_SESSIONS: KVNamespace;
  TWITTER_SESSIONS: KVNamespace;

  // Secret variables
  DISCORD_BOT_TOKEN: string;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  TWITTER_BEARER_TOKEN: string;
  CONSUMER_KEY: string;
  CONSUMER_SECRET: string;
  NEAR_KEY_PAIR: string;
  RESET_PASSWORD: string;

  // Environment variables
  DATE_THRESHOLD: string;
  RETWEET_ID: string;
  CONTRACT_ID: string;
  NETWORK_ID: string;
  NODE_URL: string;
  WALLET_URL: string;
  HELPER_URL: string;
  EXPLORER_URL: string;
}
