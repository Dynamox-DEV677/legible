/**
 * Every source Legible cites, in one place. The interface, the command line and the
 * README all read from here, so a citation cannot drift between them.
 *
 * Each entry was read at the source before it went in (the W3C pages and the PubMed
 * abstracts, November 2026). `says` is a short paraphrase of what that source supports.
 * Where a claim in Legible goes beyond a source, the interface says so in plain words.
 */

export const SOURCES = {
  flesch: {
    label: 'Flesch (1948)',
    title: 'A new readability yardstick',
    where: 'Journal of Applied Psychology, 32(3), 221–233',
    url: 'https://doi.org/10.1037/h0057532',
    says: 'Reading Ease = 206.835 − 1.015 × words per sentence − 84.6 × syllables per word.',
  },
  kincaid: {
    label: 'Kincaid, Fishburne, Rogers & Chissom (1975)',
    title: 'Derivation of new readability formulas for Navy enlisted personnel',
    where: 'Research Branch Report 8-75, U.S. Naval Technical Training Command',
    url: '',
    says: 'Grade level = 0.39 × words per sentence + 11.8 × syllables per word − 15.59.',
  },
  govuk: {
    label: 'GOV.UK content guidance',
    title: 'Sentence length: why 25 words is our limit',
    where: 'Inside GOV.UK blog, 4 August 2014',
    url: 'https://insidegovuk.blog.gov.uk/2014/08/04/sentence-length-why-25-words-is-our-limit/',
    says: 'The GOV.UK style guide asks writers to break up or condense sentences longer than 25 words.',
  },
  subtitles: {
    label: 'Brysbaert & New (2009)',
    title: 'Moving beyond Kučera and Francis: a critical evaluation of current word frequency norms',
    where: 'Behavior Research Methods, 41(4), 977–990',
    url: 'https://doi.org/10.3758/BRM.41.4.977',
    says: 'Word frequencies taken from film and television subtitles predict how fast people recognise a word better than frequencies taken from written sources.',
  },
  spacing: {
    label: 'WCAG 2.2, Success Criterion 1.4.12 Text Spacing (Level AA)',
    title: 'Understanding SC 1.4.12',
    where: 'W3C Web Accessibility Initiative',
    url: 'https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html',
    says: 'Pages must not lose content when a reader sets line height to 1.5, paragraph spacing to 2, letter spacing to 0.12 and word spacing to 0.16 times the font size.',
  },
  resize: {
    label: 'WCAG 2.2, Success Criterion 1.4.4 Resize Text (Level AA)',
    title: 'Understanding SC 1.4.4',
    where: 'W3C Web Accessibility Initiative',
    url: 'https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html',
    says: 'Text can be resized up to 200 percent without assistive technology and without loss of content or functionality.',
  },
  presentation: {
    label: 'WCAG 2.2, Success Criterion 1.4.8 Visual Presentation (Level AAA)',
    title: 'Understanding SC 1.4.8',
    where: 'W3C Web Accessibility Initiative',
    url: 'https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation.html',
    says: 'Readers can choose colours; lines are no wider than 80 characters; text is not justified; line spacing is at least one and a half within paragraphs.',
  },
  contrast: {
    label: 'WCAG 2.2, Success Criterion 1.4.3 Contrast (Minimum) (Level AA)',
    title: 'Understanding SC 1.4.3',
    where: 'W3C Web Accessibility Initiative',
    url: 'https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html',
    says: 'Text has a contrast ratio of at least 4.5:1 against its background. The page also defines how the ratio is calculated.',
  },
  contrastEnhanced: {
    label: 'WCAG 2.2, Success Criterion 1.4.6 Contrast (Enhanced) (Level AAA)',
    title: 'Understanding SC 1.4.6',
    where: 'W3C Web Accessibility Initiative',
    url: 'https://www.w3.org/WAI/WCAG22/Understanding/contrast-enhanced.html',
    says: 'Text has a contrast ratio of at least 7:1 against its background.',
  },
  measure: {
    label: 'Bringhurst, The Elements of Typographic Style',
    title: 'Choose a comfortable measure (§2.1.2)',
    where: 'as quoted at webtypography.net',
    url: 'http://webtypography.net/2.1.2',
    says: 'Lines of 45 to 75 characters are widely regarded as satisfactory, and 66 as ideal. This is a typographic convention, not an experimental result.',
  },
  zorzi: {
    label: 'Zorzi et al. (2012)',
    title: 'Extra-large letter spacing improves reading in dyslexia',
    where: 'Proceedings of the National Academy of Sciences, 109(28), 11455–11459',
    url: 'https://doi.org/10.1073/pnas.1205566109',
    says: 'Wider letter spacing improved text reading, without any training, in a large sample of Italian and French children with dyslexia.',
  },
  marinus: {
    label: 'Marinus et al. (2016)',
    title: 'A special font for people with dyslexia: does it work and, if so, why?',
    where: 'Dyslexia, 22(3), 233–244',
    url: 'https://doi.org/10.1002/dys.1527',
    says: 'The benefit of the Dyslexie font came from its spacing, not its letter shapes: Arial with matched spacing did as well.',
  },
  wery: {
    label: 'Wery & Diliberto (2017)',
    title: 'The effect of a specialized dyslexia font, OpenDyslexic, on reading rate and accuracy',
    where: 'Annals of Dyslexia, 67(2), 114–127',
    url: 'https://doi.org/10.1007/s11881-016-0127-1',
    says: 'OpenDyslexic did not improve reading rate or accuracy for students with dyslexia compared with Arial and Times New Roman.',
  },
  kuster: {
    label: 'Kuster et al. (2018)',
    title: 'Dyslexie font does not benefit reading in children with or without dyslexia',
    where: 'Annals of Dyslexia, 68(1), 25–42',
    url: 'https://doi.org/10.1007/s11881-017-0154-6',
    says: 'Children did not read faster or more accurately in the Dyslexie font than in Arial or Times New Roman.',
  },
  azzarello: {
    label: 'Azzarello et al. (2026)',
    title: 'Does font improve reading in dyslexic children? Meta-analysis of dyslexia-friendly fonts',
    where: 'Annals of Dyslexia, 76(3), 635–657',
    url: 'https://doi.org/10.1007/s11881-026-00389-8',
    says: 'Across 15 studies, dyslexia-friendly fonts had no consistent or reliable effect on reading speed or accuracy.',
  },
};
