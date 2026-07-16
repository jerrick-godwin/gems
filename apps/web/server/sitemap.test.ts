import assert from "node:assert/strict";
import test from "node:test";
import { buildSitemapXml, escapeXml } from "./sitemap.js";

test("sitemap uses content dates, stable images, and escaped XML", () => {
  const xml = buildSitemapXml("https://gemslanka.lk", [{
    id: "listing & 1",
    gemTypeId: "agate",
    updatedAt: "2026-07-14T09:30:00.000Z",
    images: [{ order: 0, alt: "Blue & <rare> agate" }]
  }], [
    { id: "sapphire", slug: "sapphire" },
    { id: "agate", slug: "agate" },
    { id: "onyx", slug: "onyx" }
  ]);

  assert.match(xml, /<lastmod>2026-07-14<\/lastmod>/);
  assert.match(xml, /https:\/\/gemslanka\.lk\/media\/listings\/listing%20%26%201\/photos\/0/);
  assert.match(xml, /Blue &amp; &lt;rare&gt; agate/);
  assert.match(xml, /https:\/\/gemslanka\.lk\/gemstones\/sapphire/);
  assert.match(xml, /https:\/\/gemslanka\.lk\/gemstones\/agate/);
  assert.doesNotMatch(xml, /gemstones\/onyx/);
  assert.doesNotMatch(xml, /privacy-policy|terms-and-conditions|refund-policy|\?sig=/);
});

test("XML escaping covers attribute-significant characters", () => {
  assert.equal(escapeXml(`A&B <C> "D" 'E'`), "A&amp;B &lt;C&gt; &quot;D&quot; &#39;E&#39;");
});
