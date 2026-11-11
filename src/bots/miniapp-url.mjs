import { URL } from "node:url";

/**
 * Explicitly configured, provider-specific launch URL for an AROMAN-owned
 * HTTPS Mini App. Disabled by default and never derived from chat input.
 * A provider URL is an entrypoint, not a verified authentication identity.
 */
export function readMiniAppUrl(value,platform){
  if(value==="")return "";
  if(!["bale","telegram"].includes(platform))throw Error("Unsupported Mini App provider");
  if(typeof value!=="string"||value!==value.trim())throw Error("Invalid Mini App URL");
  let u;
  try{u=new URL(value);}catch{throw Error("Invalid Mini App URL");}
  if(u.protocol!=="https:"||u.username||u.password||u.port||u.hash)
    throw Error("Mini App URL must be approved HTTPS without credentials, port or fragment");
  if(u.hostname!=="aroman.ir"&&!u.hostname.endsWith(".aroman.ir"))
    throw Error("Mini App host is not an approved AROMAN domain");
  if(!/^\/scent-quest\/mini\/?$/.test(u.pathname))
    throw Error("Mini App path is not approved");
  const params=[...u.searchParams.entries()];
  if(params.length!==1||params[0][0]!=="provider"||params[0][1]!==platform)
    throw Error("Mini App URL requires exactly its matching provider hint");
  return u.toString();
}
