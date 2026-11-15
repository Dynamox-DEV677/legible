/**
 * Every source Legible cites: its name and where to read it. The interface, the command
 * line and the README all read from here, so a citation cannot drift between them.
 *
 * What each source says, and exactly what Legible takes from it, is in
 * src/app/source-notes.js. That longer text is shown on the app's Sources page and is
 * left out of the bookmarklet to keep it small.
 */

export const SOURCES = {
  flesch: { label: "Flesch (1948)", url: "https://doi.org/10.1037/h0057532" },
  kincaid: { label: "Kincaid, Fishburne, Rogers & Chissom (1975)", url: "" },
  govuk: { label: "GOV.UK content guidance", url: "https://insidegovuk.blog.gov.uk/2014/08/04/sentence-length-why-25-words-is-our-limit/" },
  subtitles: { label: "Brysbaert & New (2009)", url: "https://doi.org/10.3758/BRM.41.4.977" },
  spacing: { label: "WCAG 2.2, Success Criterion 1.4.12 Text Spacing (Level AA)", url: "https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html" },
  resize: { label: "WCAG 2.2, Success Criterion 1.4.4 Resize Text (Level AA)", url: "https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html" },
  presentation: { label: "WCAG 2.2, Success Criterion 1.4.8 Visual Presentation (Level AAA)", url: "https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation.html" },
  contrast: { label: "WCAG 2.2, Success Criterion 1.4.3 Contrast (Minimum) (Level AA)", url: "https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html" },
  contrastEnhanced: { label: "WCAG 2.2, Success Criterion 1.4.6 Contrast (Enhanced) (Level AAA)", url: "https://www.w3.org/WAI/WCAG22/Understanding/contrast-enhanced.html" },
  measure: { label: "Bringhurst, The Elements of Typographic Style", url: "http://webtypography.net/2.1.2" },
  zorzi: { label: "Zorzi et al. (2012)", url: "https://doi.org/10.1073/pnas.1205566109" },
  marinus: { label: "Marinus et al. (2016)", url: "https://doi.org/10.1002/dys.1527" },
  wery: { label: "Wery & Diliberto (2017)", url: "https://doi.org/10.1007/s11881-016-0127-1" },
  kuster: { label: "Kuster et al. (2018)", url: "https://doi.org/10.1007/s11881-017-0154-6" },
  azzarello: { label: "Azzarello et al. (2026)", url: "https://doi.org/10.1007/s11881-026-00389-8" },
};
