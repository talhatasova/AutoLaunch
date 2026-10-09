export const bareHost = (url: string | URL) => new URL(url).hostname.toLowerCase().replace(/^www\./, "");
/** True when `url` is on `host` or one of its subdomains. `host` must already be bare. */
export const onHost = (url: string | URL, host: string) => {
  const h = bareHost(url);
  return h === host || h.endsWith(`.${host}`);
};
