/**
 * EARTH ONE — KNOWLEDGE UNIVERSE GRAPH
 * A curated, factual, public-domain knowledge graph connecting civilizations,
 * historical periods, people, places, languages, scientific concepts, ideas,
 * and works. This is real encyclopedic data (names, dates, and relationships
 * are public knowledge), not fabricated statistics.
 *
 * Every edge (relatedIds) represents a genuine historical/cultural link.
 * bookIds point to books that already exist in the Digital Library store.
 */

import type { KnowledgeNode } from '../src/types/index.ts';

export const KNOWLEDGE_NODES: KnowledgeNode[] = [
  // ---------------------------------------------------------------- civilizations
  {
    id: 'civ_islamic',
    type: 'civilization',
    title: '伊斯兰文明',
    titleEn: 'Islamic Civilization',
    description:
      '起源于 7 世纪阿拉伯半岛的文明体系，融合了阿拉伯、波斯、希腊、印度与中亚传统，在科学、哲学、医学、数学、建筑与法律等领域留下了深远影响。',
    aliases: ['Islamic civilization', 'Islamic Golden Age civilization', '伊斯兰黄金时代文明'],
    tags: ['文明', 'civilization', '伊斯兰'],
    relatedIds: ['per_ibn_sina', 'per_ibn_khaldun', 'place_mecca', 'place_baghdad', 'lang_arabic', 'concept_algebra', 'period_golden_age'],
    countryCode: 'SA'
  },
  {
    id: 'civ_chinese',
    type: 'civilization',
    title: '中华文明',
    titleEn: 'Chinese Civilization',
    description:
      '延续数千年、以汉字和儒家思想为核心纽带之一的东亚文明，在文字、农业、造纸、印刷、天文、医学与治理思想方面有重要贡献。',
    aliases: ['Chinese civilization', 'Sinic civilization', '华夏文明'],
    tags: ['文明', 'civilization', '中国'],
    relatedIds: ['per_confucius', 'per_laozi', 'place_changan', 'lang_chinese', 'thought_confucianism', 'concept_printing'],
    countryCode: 'CN'
  },
  {
    id: 'civ_greek',
    type: 'civilization',
    title: '古希腊文明',
    titleEn: 'Ancient Greek Civilization',
    description:
      '公元前 8 世纪至公元前 1 世纪左右繁荣于地中海东部的文明，奠定了西方哲学、科学方法、民主政治与戏剧、艺术的重要基础。',
    aliases: ['Ancient Greek civilization', 'Hellenic civilization', '希腊文明'],
    tags: ['文明', 'civilization', '希腊'],
    relatedIds: ['per_plato', 'per_aristotle', 'place_athens', 'lang_greek', 'thought_greek_philosophy'],
    countryCode: 'GR'
  },
  {
    id: 'civ_roman',
    type: 'civilization',
    title: '古罗马文明',
    titleEn: 'Roman Civilization',
    description:
      '以罗马城为中心、从共和走向帝国的地中海文明，在法律、工程、建筑、拉丁语和行政体系方面深刻影响了后世欧洲与世界。',
    aliases: ['Roman civilization', 'Ancient Rome', '罗马文明'],
    tags: ['文明', 'civilization', '罗马'],
    relatedIds: ['lang_latin', 'place_alexandria', 'civ_greek'],
    countryCode: 'IT'
  },

  // ---------------------------------------------------------------- historical periods
  {
    id: 'period_golden_age',
    type: 'historical_period',
    title: '伊斯兰黄金时代',
    titleEn: 'Islamic Golden Age',
    description:
      '约 8 世纪至 13 世纪，伊斯兰世界在巴格达智慧宫等学术中心推动数学、天文学、医学、哲学与翻译运动，保存并发展了古典知识。',
    aliases: ['Islamic Golden Age', 'Golden Age of Islam', '阿拔斯黄金时代'],
    tags: ['历史时期', 'period', '黄金时代'],
    relatedIds: ['per_ibn_sina', 'per_ibn_khaldun', 'place_baghdad', 'concept_algebra', 'concept_astronomy', 'civ_islamic']
  },
  {
    id: 'period_renaissance',
    type: 'historical_period',
    title: '文艺复兴',
    titleEn: 'Renaissance',
    description:
      '14 至 17 世纪发端于意大利、随后扩展至欧洲的思想与艺术运动，复兴古典人文精神，推动艺术、科学与近代世界观的形成。',
    aliases: ['Renaissance', '意大利文艺复兴', 'Rinascimento'],
    tags: ['历史时期', 'period', '文艺复兴'],
    relatedIds: ['per_da_vinci', 'per_galileo', 'place_florence', 'art_mona_lisa', 'civ_greek']
  },
  {
    id: 'period_axial',
    type: 'historical_period',
    title: '轴心时代',
    titleEn: 'Axial Age',
    description:
      '约公元前 8 世纪至公元前 3 世纪，欧亚大陆多个文明几乎同时出现重要思想突破，如希腊哲学、中国诸子百家、印度与波斯的宗教思想。',
    aliases: ['Axial Age', '轴心时代', 'Achsenzeit'],
    tags: ['历史时期', 'period', '轴心时代'],
    relatedIds: ['per_confucius', 'per_laozi', 'per_plato', 'thought_confucianism', 'thought_greek_philosophy']
  },

  // ---------------------------------------------------------------- persons
  {
    id: 'per_ibn_sina',
    type: 'person',
    title: '伊本·西那（阿维森纳）',
    titleEn: 'Ibn Sina (Avicenna)',
    description:
      '约 980–1037 年，波斯博学者、哲学家与医学家，著有《医典》与《治疗论》，其著作在中世纪欧洲被长期用作标准教材。',
    aliases: ['Ibn Sina', 'Avicenna', '阿维森纳', '伊本西那'],
    tags: ['人物', 'person', '医学', '哲学'],
    relatedIds: ['civ_islamic', 'period_golden_age', 'place_baghdad', 'concept_astronomy'],
    bookIds: []
  },
  {
    id: 'per_ibn_khaldun',
    type: 'person',
    title: '伊本·赫勒敦',
    titleEn: 'Ibn Khaldun',
    description:
      '1332–1406 年，阿拉伯历史学家与社会学家，著有《历史绪论》（Muqaddimah），被视为社会学与历史哲学的重要先驱。',
    aliases: ['Ibn Khaldun', '伊本赫勒敦', 'Ibn Khaldoun'],
    tags: ['人物', 'person', '历史', '社会学'],
    relatedIds: ['civ_islamic', 'period_golden_age', 'place_baghdad']
  },
  {
    id: 'per_confucius',
    type: 'person',
    title: '孔子',
    titleEn: 'Confucius',
    description:
      '约公元前 551–479 年，中国思想家与教育家，儒家学派创始人，其言行被整理为《论语》，深刻影响东亚伦理与政治思想。',
    aliases: ['Confucius', '孔丘', '孔夫子', 'Kongzi'],
    tags: ['人物', 'person', '儒家', '哲学'],
    relatedIds: ['civ_chinese', 'period_axial', 'thought_confucianism', 'lang_chinese'],
    bookIds: []
  },
  {
    id: 'per_laozi',
    type: 'person',
    title: '老子',
    titleEn: 'Laozi',
    description:
      '相传为春秋时期思想家，《道德经》的作者，道家思想奠基人，主张「道法自然」与无为而治。',
    aliases: ['Laozi', 'Lao Tzu', '老聃'],
    tags: ['人物', 'person', '道家', '哲学'],
    relatedIds: ['civ_chinese', 'period_axial', 'thought_confucianism', 'lang_chinese'],
    bookIds: ['book_daodejing']
  },
  {
    id: 'per_plato',
    type: 'person',
    title: '柏拉图',
    titleEn: 'Plato',
    description:
      '约公元前 427–347 年，古希腊哲学家，苏格拉底的学生、亚里士多德的老师，创立雅典学园，著有《理想国》等对话录。',
    aliases: ['Plato', '柏拉圖'],
    tags: ['人物', 'person', '哲学', '希腊'],
    relatedIds: ['civ_greek', 'period_axial', 'thought_greek_philosophy', 'per_aristotle', 'place_athens'],
    bookIds: ['book_republic']
  },
  {
    id: 'per_aristotle',
    type: 'person',
    title: '亚里士多德',
    titleEn: 'Aristotle',
    description:
      '公元前 384–322 年，古希腊哲学家与科学家，柏拉图的学生，研究范围涵盖逻辑、伦理、政治、生物学与物理学，影响深远。',
    aliases: ['Aristotle', '亞里士多德'],
    tags: ['人物', 'person', '哲学', '科学'],
    relatedIds: ['civ_greek', 'thought_greek_philosophy', 'per_plato', 'place_athens']
  },
  {
    id: 'per_galileo',
    type: 'person',
    title: '伽利略·伽利莱',
    titleEn: 'Galileo Galilei',
    description:
      '1564–1642 年，意大利天文学家、物理学家与工程师，改进望远镜并进行天文观测，支持哥白尼日心说，是近代科学方法的重要奠基人。',
    aliases: ['Galileo', '伽利略', 'Galileo Galilei'],
    tags: ['人物', 'person', '天文学', '科学'],
    relatedIds: ['period_renaissance', 'concept_astronomy', 'concept_heliocentrism', 'per_copernicus', 'place_florence']
  },
  {
    id: 'per_copernicus',
    type: 'person',
    title: '尼古拉·哥白尼',
    titleEn: 'Nicolaus Copernicus',
    description:
      '1473–1543 年，波兰天文学家，提出日心说宇宙模型，著有《天体运行论》，深刻改变了人类对宇宙的认识。',
    aliases: ['Copernicus', '哥白尼', 'Nicolaus Copernicus'],
    tags: ['人物', 'person', '天文学', '科学'],
    relatedIds: ['concept_heliocentrism', 'concept_astronomy', 'per_galileo'],
    bookIds: ['book_copernicus']
  },
  {
    id: 'per_da_vinci',
    type: 'person',
    title: '列奥纳多·达·芬奇',
    titleEn: 'Leonardo da Vinci',
    description:
      '1452–1519 年，意大利博学者与艺术家，文艺复兴时期代表人物，创作《蒙娜丽莎》《最后的晚餐》，并在解剖、工程等领域留下大量手稿。',
    aliases: ['Leonardo da Vinci', '达芬奇', '達文西'],
    tags: ['人物', 'person', '艺术', '文艺复兴'],
    relatedIds: ['period_renaissance', 'art_mona_lisa', 'place_florence']
  },

  // ---------------------------------------------------------------- places
  {
    id: 'place_mecca',
    type: 'place',
    title: '麦加',
    titleEn: 'Mecca',
    description:
      '位于今沙特阿拉伯西部的城市，伊斯兰教最神圣的城市之一，是先知穆罕默德的出生地，也是朝觐的目的地。',
    aliases: ['Mecca', 'Makkah', '麦加', 'مكة'],
    tags: ['地点', 'place', '城市'],
    relatedIds: ['civ_islamic', 'lang_arabic'],
    countryCode: 'SA'
  },
  {
    id: 'place_baghdad',
    type: 'place',
    title: '巴格达',
    titleEn: 'Baghdad',
    description:
      '伊拉克首都，8 世纪起成为阿拔斯王朝都城，其「智慧宫」是伊斯兰黄金时代重要的学术与翻译中心。',
    aliases: ['Baghdad', '巴格达', 'بغداد'],
    tags: ['地点', 'place', '城市'],
    relatedIds: ['civ_islamic', 'period_golden_age', 'per_ibn_sina', 'per_ibn_khaldun'],
    countryCode: 'IQ'
  },
  {
    id: 'place_athens',
    type: 'place',
    title: '雅典',
    titleEn: 'Athens',
    description:
      '希腊首都，古希腊城邦与民主政治的发源地，也是哲学、戏剧与艺术的中心，柏拉图学园所在地。',
    aliases: ['Athens', '雅典', 'Αθήνα'],
    tags: ['地点', 'place', '城市'],
    relatedIds: ['civ_greek', 'per_plato', 'per_aristotle', 'thought_greek_philosophy'],
    countryCode: 'GR'
  },
  {
    id: 'place_changan',
    type: 'place',
    title: '长安',
    titleEn: "Chang'an",
    description:
      '中国古代多朝都城（今西安一带），汉唐时期是丝绸之路的东方起点，也是当时世界上规模最大的城市之一。',
    aliases: ["Chang'an", '长安', 'Xi an', '西安'],
    tags: ['地点', 'place', '城市', '丝绸之路'],
    relatedIds: ['civ_chinese', 'lang_chinese'],
    countryCode: 'CN'
  },
  {
    id: 'place_florence',
    type: 'place',
    title: '佛罗伦萨',
    titleEn: 'Florence',
    description:
      '意大利托斯卡纳地区城市，文艺复兴的重要发源地之一，孕育了达·芬奇、米开朗琪罗等艺术家，也是银行与人文思想的中心。',
    aliases: ['Florence', 'Firenze', '佛罗伦萨'],
    tags: ['地点', 'place', '城市', '文艺复兴'],
    relatedIds: ['period_renaissance', 'per_da_vinci', 'per_galileo', 'art_mona_lisa'],
    countryCode: 'IT'
  },
  {
    id: 'place_alexandria',
    type: 'place',
    title: '亚历山大港',
    titleEn: 'Alexandria',
    description:
      '埃及地中海沿岸城市，由亚历山大大帝建立，其古代图书馆曾是古典世界最重要的学术中心之一。',
    aliases: ['Alexandria', '亚历山大港', 'الإسكندرية'],
    tags: ['地点', 'place', '城市', '图书馆'],
    relatedIds: ['civ_greek', 'civ_roman', 'lang_greek'],
    countryCode: 'EG'
  },

  // ---------------------------------------------------------------- languages
  {
    id: 'lang_arabic',
    type: 'language',
    title: '阿拉伯语',
    titleEn: 'Arabic',
    description:
      '闪米特语系语言，是《古兰经》的语言，也是伊斯兰文明学术、科学与文学的重要载体，拥有大量使用人口与丰富的书面传统。',
    aliases: ['Arabic', 'العربية', '阿拉伯文'],
    tags: ['语言', 'language'],
    relatedIds: ['civ_islamic', 'period_golden_age', 'place_mecca'],
    countryCode: 'SA'
  },
  {
    id: 'lang_chinese',
    type: 'language',
    title: '汉语',
    titleEn: 'Chinese',
    description:
      '汉藏语系语言，使用汉字书写，是世界上母语使用人数最多的语言之一，承载了数千年的中华文明典籍。',
    aliases: ['Chinese', '中文', '汉语', 'Mandarin'],
    tags: ['语言', 'language'],
    relatedIds: ['civ_chinese', 'per_confucius', 'per_laozi', 'place_changan'],
    countryCode: 'CN'
  },
  {
    id: 'lang_greek',
    type: 'language',
    title: '希腊语',
    titleEn: 'Greek',
    description:
      '印欧语系语言，拥有三千多年的书面记录，是西方哲学、科学与《新约》的重要语言。',
    aliases: ['Greek', '希腊语', 'Ελληνικά'],
    tags: ['语言', 'language'],
    relatedIds: ['civ_greek', 'thought_greek_philosophy', 'place_athens'],
    countryCode: 'GR'
  },
  {
    id: 'lang_latin',
    type: 'language',
    title: '拉丁语',
    titleEn: 'Latin',
    description:
      '古罗马的语言，长期作为欧洲学术、宗教、法律与科学的通用书面语言，是现代罗曼语族的源头。',
    aliases: ['Latin', '拉丁语', 'Lingua Latina'],
    tags: ['语言', 'language'],
    relatedIds: ['civ_roman', 'civ_greek'],
    countryCode: 'IT'
  },

  // ---------------------------------------------------------------- scientific concepts
  {
    id: 'concept_algebra',
    type: 'scientific_concept',
    title: '代数学',
    titleEn: 'Algebra',
    description:
      '研究数与符号运算规律的数学分支，其名称源自花拉子米（Al-Khwarizmi）的著作，在伊斯兰黄金时代得到系统发展。',
    aliases: ['Algebra', '代数', '代数学'],
    tags: ['科学概念', 'concept', '数学'],
    relatedIds: ['civ_islamic', 'period_golden_age', 'per_ibn_sina']
  },
  {
    id: 'concept_astronomy',
    type: 'scientific_concept',
    title: '天文学',
    titleEn: 'Astronomy',
    description:
      '研究天体与宇宙的学科，从古代巴比伦、希腊到伊斯兰黄金时代与近代科学革命，一直是推动数学与观测技术进步的重要领域。',
    aliases: ['Astronomy', '天文学', '天文'],
    tags: ['科学概念', 'concept', '天文学'],
    relatedIds: ['period_golden_age', 'per_galileo', 'per_copernicus', 'concept_heliocentrism']
  },
  {
    id: 'concept_heliocentrism',
    type: 'scientific_concept',
    title: '日心说',
    titleEn: 'Heliocentrism',
    description:
      '认为太阳（而非地球）是宇宙中心的天文模型，由哥白尼系统提出，经伽利略观测与开普勒、牛顿的完善而确立。',
    aliases: ['Heliocentrism', '日心说', 'Copernican model'],
    tags: ['科学概念', 'concept', '天文学'],
    relatedIds: ['per_copernicus', 'per_galileo', 'concept_astronomy']
  },
  {
    id: 'concept_printing',
    type: 'scientific_concept',
    title: '印刷术',
    titleEn: 'Printing',
    description:
      '复制文字与图像的工艺。中国发明了雕版印刷与活字印刷，古腾堡的金属活字印刷在欧洲推动了知识的大规模传播。',
    aliases: ['Printing', '印刷术', '活字印刷', 'Printing press'],
    tags: ['科学概念', 'concept', '印刷'],
    relatedIds: ['civ_chinese', 'period_renaissance']
  },

  // ---------------------------------------------------------------- thought / ideas
  {
    id: 'thought_confucianism',
    type: 'thought',
    title: '儒家思想',
    titleEn: 'Confucianism',
    description:
      '以孔子为代表、强调仁、义、礼、智、信与社会伦理秩序的思想传统，深刻塑造了东亚的社会、教育与政治文化。',
    aliases: ['Confucianism', '儒家', '儒学'],
    tags: ['思想', 'thought', '儒家'],
    relatedIds: ['per_confucius', 'civ_chinese', 'period_axial', 'lang_chinese']
  },
  {
    id: 'thought_greek_philosophy',
    type: 'thought',
    title: '希腊哲学',
    titleEn: 'Greek Philosophy',
    description:
      '发端于古希腊、以理性探究自然、伦理、存在与知识为核心的思想传统，是西方哲学与科学方法的重要源头。',
    aliases: ['Greek philosophy', '希腊哲学', 'Hellenic philosophy'],
    tags: ['思想', 'thought', '哲学'],
    relatedIds: ['civ_greek', 'per_plato', 'per_aristotle', 'period_axial', 'place_athens']
  },

  // ---------------------------------------------------------------- artworks
  {
    id: 'art_mona_lisa',
    type: 'artwork',
    title: '蒙娜丽莎',
    titleEn: 'Mona Lisa',
    description:
      '列奥纳多·达·芬奇创作于约 1503–1506 年的肖像画，现藏于巴黎卢浮宫，是世界上最著名的绘画作品之一。',
    aliases: ['Mona Lisa', '蒙娜丽莎', 'La Gioconda'],
    tags: ['艺术作品', 'artwork', '绘画'],
    relatedIds: ['per_da_vinci', 'period_renaissance', 'place_florence']
  }
];

const byId = new Map(KNOWLEDGE_NODES.map(n => [n.id, n]));

/** Resolve related nodes with their full objects. */
export function getRelatedNodes(id: string): KnowledgeNode[] {
  const node = byId.get(id);
  if (!node) return [];
  return node.relatedIds
    .map(rid => byId.get(rid))
    .filter((n): n is KnowledgeNode => Boolean(n));
}

export function getKnowledgeNode(id: string): KnowledgeNode | undefined {
  return byId.get(id);
}

export function getAllKnowledgeNodes(): KnowledgeNode[] {
  return KNOWLEDGE_NODES;
}

export function getKnowledgeNodeByCountry(code: string): KnowledgeNode[] {
  const c = code.toUpperCase();
  return KNOWLEDGE_NODES.filter(n => n.countryCode?.toUpperCase() === c);
}

/** Simple, dependency-free search across title, aliases, tags, and description. */
export function searchKnowledge(query: string, limit = 12): KnowledgeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return KNOWLEDGE_NODES.slice(0, limit);

  const scored = KNOWLEDGE_NODES.map(n => {
    let score = 0;
    const hay = [
      n.title,
      n.titleEn || '',
      n.description,
      ...(n.aliases || []),
      ...(n.tags || [])
    ].join(' ').toLowerCase();

    if (n.title.toLowerCase() === q) score += 100;
    if ((n.titleEn || '').toLowerCase() === q) score += 90;
    if ((n.aliases || []).some(a => a.toLowerCase() === q)) score += 80;
    if (n.title.toLowerCase().includes(q) || (n.titleEn || '').toLowerCase().includes(q)) score += 40;
    if (hay.includes(q)) score += 20;
    // Also match individual query terms
    for (const term of q.split(/\s+/).filter(t => t.length > 1)) {
      if (hay.includes(term)) score += 5;
    }
    return { n, score };
  });

  return scored
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.n);
}
