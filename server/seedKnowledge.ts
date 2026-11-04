import { Book } from '../src/types/index.ts';

export const SEED_BOOKS: Book[] = [
  {
    id: 'book_republic',
    title: 'The Republic (理想国)',
    author: 'Plato (柏拉图)',
    category: 'philosophy',
    language: 'en',
    year: 'c. 375 BC',
    source: 'Project Gutenberg',
    coverImage: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80',
    description: 'Socratic dialogue concerning justice, the order and character of the just city-state, and the just human being.',
    readProgress: 12,
    textAvailability: 'excerpt',
    chapters: [
      {
        id: 'ch1',
        title: 'Book I: The Nature of Justice',
        content: `I went down yesterday to the Piraeus with Glaucon the son of Ariston, that I might offer up my prayers to the goddess; and also because I wanted to see in what manner they would celebrate the festival, which was a new thing.

Socrates is challenged by Cephalus, Polemarchus, and Thrasymachus on what justice truly constitutes. Thrasymachus aggressively argues that "justice is nothing else than the interest of the stronger."

Socrates proceeds with dialectic inquiry: Does a physician prescribe medicine for the advantage of the physician or for the bodily well-being of the patient? In like manner, no ruler of any kind, in so far as he is a ruler, considers or enjoins what is for himself, but what is for the subject over whom he exercises his craft. Justice is therefore not the tyranny of might, but the harmony of virtue.`
      },
      {
        id: 'ch2',
        title: 'Book VII: The Allegory of the Cave',
        content: `And now, I said, let me show in a figure how far our nature is enlightened or unenlightened: Behold! human beings living in an underground den, which has a mouth open towards the light and reaching all along the den; here they have been from their childhood, and have their legs and necks chained so that they cannot move, and can only see before them.

Above and behind them a fire is blazing at a distance, and between the fire and the prisoners there is a raised way; and you will see, if you look, a low wall built along the way, like the screen which marionette players have in front of them, over which they show the puppets.

The prisoners see only their own shadows, or the shadows of one another, which the fire throws on the opposite wall of the cave. To them, the truth would be literally nothing but the shadows of the images. When one is liberated and led into the sunlight of the intellectual realm, the sun represents the Form of the Good—the ultimate author of all things beautiful and right.`
      }
    ]
  },
  {
    id: 'book_copernicus',
    title: 'De Revolutionibus Orbium Coelestium (天体运行论)',
    author: 'Nicolaus Copernicus (尼古拉·哥白尼)',
    category: 'science',
    language: 'en',
    year: '1543',
    source: 'Internet Archive',
    coverImage: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&auto=format&fit=crop&q=80',
    description: 'The seminal work on the heliocentric theory that placed the Sun at the rest center of the universe.',
    readProgress: 5,
    textAvailability: 'excerpt',
    chapters: [
      {
        id: 'ch1',
        title: 'Book I: The Universe is Spherical and Heliocentric',
        content: `In the first place, we must observe that the universe is spherical; either because that form is the most perfect of all, requiring no join, but being a self-contained whole; or because it is the most spacious form, the most suitable for containing and preserving all things.

For the motion of the earth, though considered strange, is simpler than postulating thousands of epicycles. Why do we hesitate to grant the earth that power of movement which belongs to its form, rather than disturb the whole world, whose boundaries are unknown and unknowable?

In the center of all rests the Sun. For who would place this lamp of a very beautiful temple in another or better place than this wherefrom it can illuminate everything at the same time? As on a royal throne, the Sun rules the family of stars revolving about it.`
      }
    ]
  },
  {
    id: 'book_pride',
    title: 'Pride and Prejudice (傲慢与偏见)',
    author: 'Jane Austen (简·奥斯汀)',
    category: 'literature',
    language: 'en',
    year: '1813',
    source: 'Project Gutenberg',
    coverImage: 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=600&auto=format&fit=crop&q=80',
    description: 'A classic romantic novel examining character, class, marriage, and human morality in 19th-century England.',
    readProgress: 24,
    textAvailability: 'excerpt',
    chapters: [
      {
        id: 'ch1',
        title: 'Chapter 1: A Truth Universally Acknowledged',
        content: `It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.

However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered the rightful property of some one or other of their daughters.

"My dear Mr. Bennet," said his lady to him one day, "have you heard that Netherfield Park is let at last?" Mr. Bennet replied that he had not.`
      }
    ]
  },
  {
    id: 'book_daodejing',
    title: 'Dao De Jing (道德经)',
    author: 'Laozi (老子)',
    category: 'philosophy',
    language: 'zh',
    year: 'c. 4th Century BC',
    source: 'Open Access',
    coverImage: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600&auto=format&fit=crop&q=80',
    description: 'Ancient Chinese classic text on the Way and Virtue, foundational to philosophical Taoism.',
    readProgress: 45,
    textAvailability: 'excerpt',
    chapters: [
      {
        id: 'ch1',
        title: '第一章：道可道，非常道',
        content: `道可道，非常道；名可名，非常名。
无名天地之始；有名万物之母。
故常无欲，以观其妙；常有欲，以观其徼。
此两者，同出而异名，同谓之玄。玄之又玄，众妙之门。

【哲学释义】
宇宙万物的根本本体与终极规律，不可用有限的固定言辞去完全囊括。从虚无中显化万物生机，从秩序中体察微妙大道。`
      },
      {
        id: 'ch2',
        title: '第八章：上善若水',
        content: `上善若水。水善利万物而不争，处众人之所恶，故几于道。
居善地，心善渊，与善仁，言善信，政善治，事善能，动善时。
夫唯不争，故无尤。

【生态与人类文明启示】
最高的品格与德行犹如奔流的水，滋养润泽世间生灵而不与物竞，利万物而处卑下，这是构建全球文明命运共同体的东方智慧。`
      }
    ]
  }
];

export const SEED_CRAWLER_TASKS = [
  {
    id: 'task_nasa',
    name: 'NASA Earth Observatory 卫星环境快报',
    targetDomain: 'earthobservatory.nasa.gov',
    startUrl: 'https://earthobservatory.nasa.gov',
    maxPages: 30,
    status: 'idle' as const,
    lastRunAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    pagesCrawled: 12,
    respectsRobotsTxt: true
  },
  {
    id: 'task_gutenberg',
    name: 'Project Gutenberg 开放文献索引',
    targetDomain: 'gutenberg.org',
    startUrl: 'https://www.gutenberg.org',
    maxPages: 50,
    status: 'idle' as const,
    lastRunAt: new Date(Date.now() - 3600000 * 12).toISOString(),
    pagesCrawled: 28,
    respectsRobotsTxt: true
  }
];

export const SEED_CRAWLED_PAGES = [
  {
    id: 'page_nasa_01',
    taskId: 'task_nasa',
    url: 'https://earthobservatory.nasa.gov/images/151240/chlorophyll-bloom-in-north-atlantic',
    title: 'North Atlantic Phytoplankton Spring Bloom Measured from Space',
    author: 'NASA Ocean Biology Processing Group',
    cleanContent: `Every spring, the waters of the North Atlantic erupt into a massive bloom of microscopic plant-like organisms called phytoplankton. Satellite sensors like MODIS aboard Aqua capture chlorophyll concentrations exceeding 10 mg/m³, providing crucial biological carbon sequestration for Earth's global biosphere.`,
    crawledAt: new Date().toISOString(),
    status: 'pending_review' as const
  }
];
