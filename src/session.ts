export enum SessionHeader {
  Discord = 'X-Discord-Session',
  Twitter = 'X-Twitter-Session'
}

export interface Session {
  discord?: DiscordSession;
  twitter?: TwitterSession;
}

export interface DiscordSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface TwitterSession {
  oauthToken: string;
  oauthTokenSecret: string;
}

export function getSession(req: Request): Session | undefined {
  const discordSession = req.headers.get(SessionHeader.Discord);
  const twitterSession = req.headers.get(SessionHeader.Twitter);
  let discord: DiscordSession | undefined = undefined;
  if (discordSession) {
    discord = JSON.parse(decodeURIComponent(discordSession));
  }
  let twitter: TwitterSession | undefined = undefined;
  if (twitterSession) {
    twitter = JSON.parse(decodeURIComponent(twitterSession));
  }
  const session: Session = {
    discord,
    twitter
  };
  return session;
}
