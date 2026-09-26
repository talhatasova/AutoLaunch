import { describe, expect, it } from "vitest";
import { extractMetadata } from "./metadata";

const BASE = "https://pagecrest.io/product";

describe("extractMetadata - title", () => {
  it("prefers og:title over the document title", () => {
    const meta = extractMetadata(
      `<html><head>
         <title>Pagecrest | Home | Marketing Site</title>
         <meta property="og:title" content="Pagecrest">
       </head></html>`,
      BASE,
    );
    expect(meta.title).toBe("Pagecrest");
  });

  it("falls back to twitter:title, then to <title>", () => {
    expect(
      extractMetadata(`<html><head><meta name="twitter:title" content="Tw"><title>T</title></head></html>`, BASE).title,
    ).toBe("Tw");
    expect(extractMetadata(`<html><head><title>Just a title</title></head></html>`, BASE).title).toBe("Just a title");
  });

  it("collapses whitespace and decodes entities", () => {
    const meta = extractMetadata(`<html><head><title>  Ben &amp; Jerry&#39;s\n   Tools  </title></head></html>`, BASE);
    expect(meta.title).toBe("Ben & Jerry's Tools");
  });

  it("returns null rather than an empty string when there is no title", () => {
    expect(extractMetadata(`<html><head></head><body>hi</body></html>`, BASE).title).toBeNull();
    expect(extractMetadata(`<html><head><title>   </title></head></html>`, BASE).title).toBeNull();
  });
});

describe("extractMetadata - description", () => {
  it("prefers og:description over meta description", () => {
    const meta = extractMetadata(
      `<html><head>
         <meta name="description" content="Generic blurb">
         <meta property="og:description" content="The real one">
       </head></html>`,
      BASE,
    );
    expect(meta.description).toBe("The real one");
  });

  it("falls back to the standard meta description", () => {
    const meta = extractMetadata(`<html><head><meta name="description" content="Blurb"></head></html>`, BASE);
    expect(meta.description).toBe("Blurb");
  });

  it("is null when absent", () => {
    expect(extractMetadata(`<html><head></head></html>`, BASE).description).toBeNull();
  });
});

describe("extractMetadata - images resolve to absolute URLs", () => {
  it("resolves a root-relative og:image against the page URL", () => {
    const meta = extractMetadata(`<html><head><meta property="og:image" content="/og.png"></head></html>`, BASE);
    expect(meta.image_url).toBe("https://pagecrest.io/og.png");
  });

  it("resolves a document-relative og:image against the page's directory", () => {
    const meta = extractMetadata(`<html><head><meta property="og:image" content="og.png"></head></html>`, BASE);
    expect(meta.image_url).toBe("https://pagecrest.io/og.png");
  });

  it("keeps an already-absolute og:image", () => {
    const meta = extractMetadata(
      `<html><head><meta property="og:image" content="https://cdn.example.com/a.png"></head></html>`,
      BASE,
    );
    expect(meta.image_url).toBe("https://cdn.example.com/a.png");
  });

  it("honours <base href> when resolving", () => {
    const meta = extractMetadata(
      `<html><head><base href="https://cdn.example.com/assets/"><meta property="og:image" content="a.png"></head></html>`,
      BASE,
    );
    expect(meta.image_url).toBe("https://cdn.example.com/assets/a.png");
  });

  it("drops an image whose URL is not http(s) - a data: URI is not something we can hand a directory", () => {
    const meta = extractMetadata(
      `<html><head><meta property="og:image" content="data:image/png;base64,iVBORw0KG"></head></html>`,
      BASE,
    );
    expect(meta.image_url).toBeNull();
  });

  it("falls back to twitter:image", () => {
    const meta = extractMetadata(`<html><head><meta name="twitter:image" content="/t.png"></head></html>`, BASE);
    expect(meta.image_url).toBe("https://pagecrest.io/t.png");
  });
});

describe("extractMetadata - favicon", () => {
  it("reads rel=icon", () => {
    const meta = extractMetadata(`<html><head><link rel="icon" href="/fav.png"></head></html>`, BASE);
    expect(meta.favicon_url).toBe("https://pagecrest.io/fav.png");
  });

  it("accepts a multi-token rel like 'shortcut icon'", () => {
    const meta = extractMetadata(`<html><head><link rel="shortcut icon" href="/f.ico"></head></html>`, BASE);
    expect(meta.favicon_url).toBe("https://pagecrest.io/f.ico");
  });

  it("prefers a real icon over an apple-touch-icon", () => {
    const meta = extractMetadata(
      `<html><head>
         <link rel="apple-touch-icon" href="/apple.png">
         <link rel="icon" href="/icon.svg">
       </head></html>`,
      BASE,
    );
    expect(meta.favicon_url).toBe("https://pagecrest.io/icon.svg");
  });

  it("falls back to /favicon.ico at the origin when no link tag exists", () => {
    const meta = extractMetadata(`<html><head></head></html>`, BASE);
    expect(meta.favicon_url).toBe("https://pagecrest.io/favicon.ico");
  });
});

describe("extractMetadata - robustness", () => {
  it("still extracts from the unclosed tags and stray markup real pages ship with", () => {
    const meta = extractMetadata(
      `<html><head>
         <meta charset=utf-8>
         <title>Broken but readable</title>
         <meta property="og:image" content="/og.png">
         <link rel=icon href=/f.png>
         <p>stray <b>content in head
       </head><body>`,
      BASE,
    );
    expect(meta.title).toBe("Broken but readable");
    expect(meta.image_url).toBe("https://pagecrest.io/og.png");
    expect(meta.favicon_url).toBe("https://pagecrest.io/f.png");
  });

  it("returns a result rather than throwing when the document is truncated mid-tag", () => {
    // A response cut off by our own byte cap looks exactly like this.
    const truncated = `<html><head><title>Broken<meta property="og:image" content=`;
    expect(() => extractMetadata(truncated, BASE)).not.toThrow();
    // Whatever the parser makes of it, the origin favicon fallback still holds.
    expect(extractMetadata(truncated, BASE).favicon_url).toBe("https://pagecrest.io/favicon.ico");
  });

  it("survives an empty document", () => {
    const meta = extractMetadata("", BASE);
    expect(meta.title).toBeNull();
    expect(meta.description).toBeNull();
    expect(meta.image_url).toBeNull();
    // The origin fallback still applies - it does not depend on the document.
    expect(meta.favicon_url).toBe("https://pagecrest.io/favicon.ico");
  });

  it("truncates a runaway description instead of failing the tagline constraint downstream", () => {
    // apps.tagline is CHECK (length <= 200) and submissionPayloadSchema caps it
    // at 200 too. A 5000-char meta description must not blow up the insert.
    const meta = extractMetadata(
      `<html><head><meta name="description" content="${"a".repeat(5000)}"></head></html>`,
      BASE,
    );
    expect(meta.description).not.toBeNull();
    expect((meta.description as string).length).toBeLessThanOrEqual(2000);
  });

  it("ignores a script that looks like a meta tag", () => {
    const meta = extractMetadata(
      `<html><head><script>var s = '<meta property="og:title" content="injected">';</script><title>Real</title></head></html>`,
      BASE,
    );
    expect(meta.title).toBe("Real");
  });
});

describe("deriveTagline", () => {
  it("cuts a long description to the 200-char tagline budget on a word boundary", async () => {
    const { deriveTagline } = await import("./metadata");
    const long = "Pagecrest turns your changelog into a weekly customer email that people actually read. " +
      "It watches your repository, drafts the copy, and waits for you to approve it before anything is sent to anyone.";
    const tagline = deriveTagline(long);
    expect(tagline).not.toBeNull();
    expect((tagline as string).length).toBeLessThanOrEqual(200);
    expect((tagline as string).endsWith(" ")).toBe(false);
    // Cut on a word boundary: the last word of the tagline must be a whole word
    // from the source, not a fragment like "reposi".
    const lastWord = (tagline as string).replace(/…$/, "").trim().split(/\s+/).pop() as string;
    expect(long.split(/\s+/)).toContain(lastWord);
  });

  it("returns a short description unchanged", async () => {
    const { deriveTagline } = await import("./metadata");
    expect(deriveTagline("Short and sweet.")).toBe("Short and sweet.");
  });

  it("returns null for nothing", async () => {
    const { deriveTagline } = await import("./metadata");
    expect(deriveTagline(null)).toBeNull();
    expect(deriveTagline("   ")).toBeNull();
  });
});
