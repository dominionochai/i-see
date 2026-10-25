/**
 * Common English words, most frequent first, with everyday communication
 * needs (care, comfort, family) mixed in. Rank stands in for frequency:
 * earlier words are likelier.
 */
const WORDS = `
the be to of and a in that have i it for not on with he as you do at this but his by from they we say her she or an will my one all
would there their what so up out if about who get which go me when make can like time no just him know take people into year your
good some could them see other than then now look only come its over think also back after use two how our work first well way even
new want because any these give day most us is are was were been has had did am yes please thank thanks help need hello hi okay ok
sorry water food hungry thirsty tired sleep cold hot pain hurt doctor nurse medicine pills nurse bathroom toilet blanket pillow
bed chair window door light lights dark fan tv music radio phone call home house family love mother father mom dad daughter son
sister brother wife husband friend friends baby grandma grandpa today tomorrow tonight morning night evening later soon again
more less enough stop start wait ready done finished hungry eat drink coffee tea juice milk bread soup lunch dinner breakfast
sit stand walk move turn lift lower higher louder softer quiet loud warm cool fresh clean wash dry itchy sore sick better worse
fine great happy sad angry scared afraid worried calm alone together here where why when who which very really too much many
little big small long short fast slow always never sometimes maybe sure right wrong true real nice kind sweet beautiful
feel feeling felt hold held bring brought send sent open close closed shut push pull put kept keep let lets leave left stay
told tell ask asked answer talk spoke speak read write watch listen hear heard seen show showed find found lost try tried
believe understand remember forget know knew think thought hope wish wanted needed liked loved called helped worked
people person man woman men women child children boy girl kids kid everyone someone anyone nothing something everything
job money bank car drive driver bus train trip visit visitor party church school game games movie news paper book books
dog cat bird flowers garden outside inside upstairs downstairs room kitchen bedroom living table floor wall roof
head face eyes eye ears nose mouth teeth neck throat chest heart back arm arms hand hands finger fingers leg legs knee foot feet skin
breathe breathing cough swallow dizzy nausea fever headache stomach tight stiff numb weak strong rest relax comfortable
position adjust scratch rub massage cover uncover tissue towel glasses hearing aid mask tube bag chair wheelchair
yes no maybe okay alright fine thanks please sorry excuse pardon welcome goodbye bye goodnight morning afternoon
before during until while since though although unless whether either neither both each every another such same different
first second third last next best most least own other another around between through against without within
use used using make made making do does done doing go goes going went gone get gets getting got give gave given
`;

export interface LexiconEntry {
  word: string;
  /** 0 is the most frequent word. */
  rank: number;
}

/** De-duplicated lexicon in frequency order. Words are lowercase letters only. */
export const LEXICON: readonly LexiconEntry[] = (() => {
  const seen = new Set<string>();
  const entries: LexiconEntry[] = [];
  for (const raw of WORDS.split(/\s+/)) {
    const word = raw.toLowerCase();
    if (!/^[a-z]+$/.test(word) || seen.has(word)) continue;
    seen.add(word);
    entries.push({ word, rank: entries.length });
  }
  return entries;
})();
