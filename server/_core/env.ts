function getEnv() {
  return {
    appId: process.env.VITE_APP_ID ?? "",
    cookieSecret: process.env.JWT_SECRET ?? "",
    databaseUrl: process.env.DATABASE_URL ?? "",
    oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
    ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
    isProduction: process.env.NODE_ENV === "production",
    forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
    forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
    xApiBearerToken: process.env.X_API_BEARER_TOKEN ?? "",
    twitterApiIoKey: process.env.twitterapi_io_key ?? "",
  };
}

export const ENV = new Proxy({} as ReturnType<typeof getEnv>, {
  get(_target, prop) {
    return getEnv()[prop as keyof ReturnType<typeof getEnv>];
  },
});
