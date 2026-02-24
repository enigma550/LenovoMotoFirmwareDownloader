export const session = {
  guid: crypto.randomUUID(),
  jwt: "",
};

export const cookieJar = new Map<string, string>();
export const environmentVariables = process.env;
