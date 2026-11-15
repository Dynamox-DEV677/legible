# Data, sources and licences

Legible's code is MIT licensed. The language data it bundles comes from two open
datasets. This page says what each file is, where it came from, what was changed, and
which licence it carries.

Nothing here is downloaded when you use Legible. The datasets were fetched once, at
build time, and only the small derived files below are in the repository.

## The everyday-word list

| File | What it is |
| --- | --- |
| `data/common-words.txt` | 5,000 English word forms, most common first |
| `data/screen-words.txt` | 46 screen-era words added by hand |
| `src/core/data/common-words.js` | both lists together, compressed for the browser |

**Source.** [FrequencyWords](https://github.com/hermitdave/FrequencyWords) by Hermit Dave,
file `content/2018/en/en_50k.txt`. It counts words in the English part of
[OpenSubtitles 2018](http://opus.nlpl.eu/OpenSubtitles2018.php), a corpus of film and
television subtitles collected by the OPUS project from
[opensubtitles.org](http://www.opensubtitles.org/). OPUS asks that work using the corpus
cite: P. Lison and J. Tiedemann (2016), *OpenSubtitles2016: Extracting Large Parallel
Corpora from Movie and TV Subtitles*, LREC 2016.

**Licence.** FrequencyWords publishes its lists under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). `common-words.txt` and
`common-words.js` are adaptations of that list, so they are shared under CC BY-SA 4.0 as
well. `screen-words.txt` was written for this project and is MIT like the code.

**What was changed.** `tools/build-data.mjs` does all of it, and can be re-run:

1. Keep plain lower-case words. Drop single letters other than "a" and "i".
2. Drop the halves of contractions that the corpus split apart ("don" from "don't").
3. Drop strong profanity and slurs, so the list is safe to open in a classroom. Those
   words will show up as "uncommon" in a text, which is harmless.
4. Keep the first 5,000.
5. Add the screen words that are not already there.
6. For the browser copy, leave out every form the lookup can rebuild from a shorter word
   ("walked" from "walk"), then front-code what is left. The build checks that every one
   of the 5,000 words is still recognised afterwards.

**Why subtitles.** Subtitles are speech. A word that is rare in speech is one a struggling
reader has had little chance to meet. Brysbaert and New (2009) found that word frequencies
taken from film and television subtitles predict how quickly people recognise a word
better than frequencies taken from written sources. The list does include common first
names, because films are full of them. That does not affect results much: Legible treats a
capitalised word in mid-sentence as a name and leaves it alone.

**Why the screen words.** People read "email" and "password" every day but rarely say
them in a film, so a subtitle list ranks them low. Without the extra 46 words Legible
would underline "website" on almost every web page.

## The syllable reference

| File | What it is |
| --- | --- |
| `src/core/data/syllable-exceptions.js` | common words that the spelling rules get wrong, with the right count |
| `test/fixtures/cmu-syllables.txt` | syllable counts for the 5,000 everyday words, used by `npm test` |

**Source.** The [CMU Pronouncing Dictionary](https://github.com/cmusphinx/cmudict),
Copyright (C) 1993-2015 Carnegie Mellon University. Each entry lists a word's sounds, and
every vowel sound carries a stress mark, so counting the marks counts the syllables.

**Licence.** BSD 2-Clause. The full text, which must travel with these files, is in
[`LICENSE-cmudict.txt`](LICENSE-cmudict.txt).

**What was changed.** Only syllable counts were taken, not pronunciations. Where the
dictionary lists more than one pronunciation, every count is accepted. One family is
treated differently on purpose: the dictionary writes "tired" and "fire" as two syllables,
most dictionaries accept one, and Legible counts one.

## Rebuilding

```
node tools/fetch-data.mjs     # downloads both datasets into .cache/ (about 4 MB)
node tools/build-data.mjs     # rewrites the five derived files
npm test                      # proves nothing was lost
```
