declare interface Env {
  // Durable Objects
  DISCORD: DurableObjectNamespace;
  // USERS: DurableObjectNamespace;
  // AIRDROP: DurableObjectNamespace;
  // FOUNDER_NFT: DurableObjectNamespace;
  // TWITTER: DurableObjectNamespace;

  // Environment variables
  DISCORD_BOT_TOKEN: string;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  TWITTER_BEARER_TOKEN: string;
  CONSUMER_KEY: string;
  CONSUMER_SECRET: string;
  TWITTER_ACCESS_TOKEN: string;
}

declare module '@umanghome/login-with-twitter-cf-workers' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const x: any;
  export default x;
}

// declare interface User {
//   name: string;
// }
