/**
 * What each cited source says, in one or two sentences, and where it was published.
 *
 * Each entry was read at the source before it went in: the W3C pages directly, and the
 * journal papers through their PubMed abstracts (November 2026). `says` is a paraphrase
 * of what that source supports and nothing more. Where a claim in Legible goes beyond a
 * source, the interface says so in plain words.
 */

export const SOURCE_NOTES = {
  flesch: {
    title: "A new readability yardstick",
    where: "Journal of Applied Psychology, 32(3), 221\u2013233",
    says: "Reading Ease = 206.835 \u2212 1.015 \u00d7 words per sentence \u2212 84.6 \u00d7 syllables per word.",
  },
  kincaid: {
    title: "Derivation of new readability formulas for Navy enlisted personnel",
    where: "Research Branch Report 8-75, U.S. Naval Technical Training Command",
    says: "Grade level = 0.39 \u00d7 words per sentence + 11.8 \u00d7 syllables per word \u2212 15.59.",
  },
  govuk: {
    title: "Sentence length: why 25 words is our limit",
    where: "Inside GOV.UK blog, 4 August 2014",
    says: "The GOV.UK style guide asks writers to break up or condense sentences longer than 25 words.",
  },
  subtitles: {
    title: "Moving beyond Ku\u010dera and Francis: a critical evaluation of current word frequency norms",
    where: "Behavior Research Methods, 41(4), 977\u2013990",
    says: "Word frequencies taken from film and television subtitles predict how fast people recognise a word better than frequencies taken from written sources.",
  },
  spacing: {
    title: "Understanding SC 1.4.12",
    where: "W3C Web Accessibility Initiative",
    says: "Pages must not lose content when a reader sets line height to 1.5, paragraph spacing to 2, letter spacing to 0.12 and word spacing to 0.16 times the font size.",
  },
  resize: {
    title: "Understanding SC 1.4.4",
    where: "W3C Web Accessibility Initiative",
    says: "Text can be resized up to 200 percent without assistive technology and without loss of content or functionality.",
  },
  presentation: {
    title: "Understanding SC 1.4.8",
    where: "W3C Web Accessibility Initiative",
    says: "Readers can choose colours; lines are no wider than 80 characters; text is not justified; line spacing is at least one and a half within paragraphs.",
  },
  contrast: {
    title: "Understanding SC 1.4.3",
    where: "W3C Web Accessibility Initiative",
    says: "Text has a contrast ratio of at least 4.5:1 against its background. The page also defines how the ratio is calculated.",
  },
  contrastEnhanced: {
    title: "Understanding SC 1.4.6",
    where: "W3C Web Accessibility Initiative",
    says: "Text has a contrast ratio of at least 7:1 against its background.",
  },
  measure: {
    title: "Choose a comfortable measure (\u00a72.1.2)",
    where: "as quoted at webtypography.net",
    says: "Lines of 45 to 75 characters are widely regarded as satisfactory, and 66 as ideal. This is a typographic convention, not an experimental result.",
  },
  zorzi: {
    title: "Extra-large letter spacing improves reading in dyslexia",
    where: "Proceedings of the National Academy of Sciences, 109(28), 11455\u201311459",
    says: "Wider letter spacing improved text reading, without any training, in a large sample of Italian and French children with dyslexia.",
  },
  marinus: {
    title: "A special font for people with dyslexia: does it work and, if so, why?",
    where: "Dyslexia, 22(3), 233\u2013244",
    says: "The benefit of the Dyslexie font came from its spacing, not its letter shapes: Arial with matched spacing did as well.",
  },
  wery: {
    title: "The effect of a specialized dyslexia font, OpenDyslexic, on reading rate and accuracy",
    where: "Annals of Dyslexia, 67(2), 114\u2013127",
    says: "OpenDyslexic did not improve reading rate or accuracy for students with dyslexia compared with Arial and Times New Roman.",
  },
  kuster: {
    title: "Dyslexie font does not benefit reading in children with or without dyslexia",
    where: "Annals of Dyslexia, 68(1), 25\u201342",
    says: "Children did not read faster or more accurately in the Dyslexie font than in Arial or Times New Roman.",
  },
  azzarello: {
    title: "Does font improve reading in dyslexic children? Meta-analysis of dyslexia-friendly fonts",
    where: "Annals of Dyslexia, 76(3), 635\u2013657",
    says: "Across 15 studies, dyslexia-friendly fonts had no consistent or reliable effect on reading speed or accuracy.",
  },
};
