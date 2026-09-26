import { Button } from "@/components/ui/button";

export default function LandingPage() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <>
      <section className="shell grid min-h-[78dvh] items-center gap-12 py-20 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)] lg:py-28">
        <div>
          <p className="t-micro fg-accent">DirectoryLaunch / free beta</p>
          <h1 className="t-display fg-heading mt-7 max-w-[13ch] text-[clamp(3rem,7vw,6.7rem)]">
            Put your SaaS in the right places.
          </h1>
          <p className="fg-body mt-9 max-w-[54ch] text-lg leading-relaxed">
            Review your product details once. Choose verified free directories. We submit where
            the full path is automatable and show you what each directory actually confirmed.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-5">
            <Button asChild variant="signal" size="lg"><a href={`${appUrl}/auth/sign-in`}>Open the beta</a></Button>
            <a href="#how-it-works" className="t-micro fg-heading underline underline-offset-4">See how it works</a>
          </div>
          <p className="t-micro fg-muted mt-6">Free beta: two products, two directory submissions per product.</p>
        </div>

        <div className="edge-heavy-t edge-b lg:ml-8" aria-label="Submission status example">
          <div className="flex items-center justify-between py-4">
            <span className="t-meta fg-heading">One directory, clear evidence</span>
            <span className="t-micro fg-faint">EXAMPLE</span>
          </div>
          {[
            ["01", "Selected", "Founder approved the fields"],
            ["02", "Submitted", "The directory returned a receipt"],
            ["03", "Pending review", "Publication is not yet confirmed"],
            ["04", "Live", "A public listing URL is verified"],
          ].map(([number, title, detail]) => (
            <div key={number} className="edge-t grid grid-cols-[2rem_1fr] gap-5 py-5">
              <span className="t-data fg-accent">{number}</span>
              <div><p className="t-meta fg-heading">{title}</p><p className="fg-muted mt-1 text-sm">{detail}</p></div>
            </div>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="edge-t shell py-24">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <h2 className="t-display-sm fg-heading max-w-[14ch] text-[clamp(2.5rem,5vw,4.5rem)]">One profile. Deliberate distribution.</h2>
          <div className="edge-heavy-t">
            {[
              ["01", "Prepare", "Paste a product URL, then correct the details before anything is sent."],
              ["02", "Choose", "Compare price, category, conditions, and verification date. Select the free targets you want."],
              ["03", "Track", "See receipts, uncertain outcomes, review states, and verified live links separately."],
            ].map(([number, title, detail]) => (
              <div key={number} className="edge-b grid gap-4 py-6 sm:grid-cols-[3rem_9rem_1fr]">
                <span className="t-data fg-accent">{number}</span><h3 className="t-meta fg-heading">{title}</h3><p className="fg-body">{detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section data-theme="dark" className="surface-page py-24">
        <div className="shell grid gap-10 lg:grid-cols-[1fr_0.8fr] lg:items-end">
          <div>
            <p className="t-micro fg-accent">Built around the truth</p>
            <h2 className="t-display-sm fg-heading mt-6 max-w-[15ch] text-[clamp(2.5rem,5vw,4.5rem)]">A receipt is not a live listing.</h2>
          </div>
          <div>
            <p className="fg-body max-w-[52ch] leading-relaxed">Some directories review submissions before publishing. Some ask for a backlink or badge. Some need an account or a challenge we cannot automate. You see those conditions before choosing, and each result keeps its own evidence.</p>
            <Button asChild variant="signal" size="lg" className="mt-8"><a href={`${appUrl}/auth/sign-in`}>Open the beta</a></Button>
          </div>
        </div>
      </section>
    </>
  );
}
