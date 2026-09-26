import { describe, expect, it } from "vitest";
import { isPathAllowed, parseRobots } from "./robots";

const BOT = "DirectoryLaunchBot";

describe("parseRobots - group selection", () => {
  it("prefers a group naming us over the wildcard group", () => {
    const rules = parseRobots(
      [
        "User-agent: *",
        "Disallow: /",
        "",
        "User-agent: DirectoryLaunchBot",
        "Disallow: /admin",
      ].join("\n"),
      BOT,
    );

    expect(isPathAllowed(rules, "/")).toBe(true);
    expect(isPathAllowed(rules, "/admin")).toBe(false);
  });

  it("matches our token case-insensitively, as the spec requires", () => {
    const rules = parseRobots("User-agent: directorylaunchbot\nDisallow: /x", BOT);
    expect(isPathAllowed(rules, "/x")).toBe(false);
    expect(isPathAllowed(rules, "/y")).toBe(true);
  });

  it("matches the product token when we send a full UA string with a contact URL", () => {
    const rules = parseRobots("User-agent: DirectoryLaunchBot\nDisallow: /x", BOT);
    expect(isPathAllowed(rules, "/x")).toBe(false);
  });

  it("merges consecutive user-agent lines that share one rule block", () => {
    const rules = parseRobots(
      ["User-agent: SomeBot", "User-agent: DirectoryLaunchBot", "Disallow: /shared"].join("\n"),
      BOT,
    );
    expect(isPathAllowed(rules, "/shared")).toBe(false);
  });

  it("ignores groups for other bots entirely", () => {
    const rules = parseRobots("User-agent: GPTBot\nDisallow: /\n", BOT);
    expect(isPathAllowed(rules, "/anything")).toBe(true);
  });

  it("treats a missing or empty robots.txt as fully allowed", () => {
    expect(isPathAllowed(parseRobots("", BOT), "/")).toBe(true);
    expect(isPathAllowed(parseRobots("# nothing here\n", BOT), "/x")).toBe(true);
  });
});

describe("isPathAllowed - matching rules", () => {
  it("treats an empty Disallow as allow-all", () => {
    const rules = parseRobots("User-agent: *\nDisallow:", BOT);
    expect(isPathAllowed(rules, "/anything")).toBe(true);
  });

  it("matches by prefix", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /private", BOT);
    expect(isPathAllowed(rules, "/private")).toBe(false);
    expect(isPathAllowed(rules, "/private/deep/page")).toBe(false);
    expect(isPathAllowed(rules, "/public")).toBe(true);
  });

  it("lets the most specific rule win, and Allow wins a tie", () => {
    const rules = parseRobots(
      ["User-agent: *", "Disallow: /docs", "Allow: /docs/public"].join("\n"),
      BOT,
    );
    expect(isPathAllowed(rules, "/docs/secret")).toBe(false);
    expect(isPathAllowed(rules, "/docs/public/a")).toBe(true);
  });

  it("honours * wildcards and $ anchors", () => {
    const rules = parseRobots(
      ["User-agent: *", "Disallow: /*.pdf$", "Disallow: /a/*/b"].join("\n"),
      BOT,
    );
    expect(isPathAllowed(rules, "/manual.pdf")).toBe(false);
    expect(isPathAllowed(rules, "/manual.pdf.html")).toBe(true);
    expect(isPathAllowed(rules, "/a/anything/b")).toBe(false);
    expect(isPathAllowed(rules, "/a/b")).toBe(true);
  });

  it("does not let a regex metacharacter in a rule become a regex", () => {
    // A path rule is a glob with exactly two wildcards. `.` and `+` are literal.
    const rules = parseRobots("User-agent: *\nDisallow: /a.b+c", BOT);
    expect(isPathAllowed(rules, "/a.b+c")).toBe(false);
    expect(isPathAllowed(rules, "/axbbc")).toBe(true);
  });

  it("ignores comments and stray whitespace", () => {
    const rules = parseRobots(
      ["  User-agent:  *   # everyone", "  Disallow:  /x   # nope", "Sitemap: https://e.com/s.xml"].join("\n"),
      BOT,
    );
    expect(isPathAllowed(rules, "/x")).toBe(false);
    expect(isPathAllowed(rules, "/y")).toBe(true);
  });

  it("compares against the path and query, since rules can target query strings", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /search?q=", BOT);
    expect(isPathAllowed(rules, "/search?q=hello")).toBe(false);
    expect(isPathAllowed(rules, "/search")).toBe(true);
  });
});
