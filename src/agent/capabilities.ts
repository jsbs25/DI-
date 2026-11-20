import type { CapabilityDef } from './types';

// ALL existing modules/capabilities are registered here and preserved. None are deleted.
export const CAPABILITIES: CapabilityDef[] = [
  { id: 'home', tab: 'globe', nameZh: '数字花园 · 首页', nameEn: 'Living Garden · Home', descriptionZh: 'EARTH ONE 主世界与数字花园', descriptionEn: 'EARTH ONE living garden world', intents: ['首页', '主页', '花园', '世界', 'home', 'garden', 'globe', 'earth'], workspaceMode: 'general', category: 'core', preserved: true },
  { id: 'discover', tab: 'feed', nameZh: '发现动态', nameEn: 'Discover', descriptionZh: '全球社群动态与内容发现', descriptionEn: 'Global feed and discovery', intents: ['发现', '动态', '社区动态', '资讯', 'feed', 'discover', 'posts', 'news'], workspaceMode: 'research', category: 'social', preserved: true },
  { id: 'messages', tab: 'chat', nameZh: '消息与通话', nameEn: 'Messages & Calls', descriptionZh: '好友、私聊、群聊、语音/视频通话、文件传输、通知与在线状态（独立通信系统）', descriptionEn: 'Independent communication: friends, chats, groups, voice/video calls, files, notifications, presence', intents: ['消息', '聊天', '通话', '电话', '视频通话', '好友', '群聊', '通信', '联系人', 'message', 'chat', 'call', 'friend', 'talk'], workspaceMode: 'communication', category: 'core', preserved: true },
  { id: 'music', tab: 'venus', nameZh: '音乐馆', nameEn: 'Music', descriptionZh: '全球音乐宇宙与音频体验', descriptionEn: 'Global music universe and audio', intents: ['音乐', '歌曲', '听歌', '电台', '放首歌', 'music', 'song', 'audio', 'play music'], workspaceMode: 'music', category: 'media', preserved: true },
  { id: 'aihub', tab: 'aihub', nameZh: '人工智能中枢', nameEn: 'AI Hub', descriptionZh: 'AI 能力与工作台', descriptionEn: 'AI capabilities and workspace', intents: ['智能', '人工智能', 'ai中枢', '助手', '模型', 'ai hub'], workspaceMode: 'general', category: 'core', preserved: true },
  { id: 'universe', tab: 'universe', nameZh: '3D 宇宙探索', nameEn: 'Universe', descriptionZh: '交互式太阳系与天体探索', descriptionEn: 'Interactive solar system explorer', intents: ['宇宙', '星空', '星球', '太阳系', '太空', 'universe', 'space', 'planet', 'star'], workspaceMode: 'general', category: 'explore', preserved: true },
  { id: 'library', tab: 'library', nameZh: '世界图书馆', nameEn: 'World Library', descriptionZh: '全球数字图书馆与阅读知识检索', descriptionEn: 'Global digital library and reading', intents: ['图书馆', '看书', '阅读', '书籍', '读书', 'library', 'book', 'read'], workspaceMode: 'reading', category: 'knowledge', preserved: true },
  { id: 'browser', tab: 'browser', nameZh: '智能浏览器', nameEn: 'Browser', descriptionZh: '网络浏览与信息获取', descriptionEn: 'Web browsing and information access', intents: ['浏览器', '上网', '网页', '打开网页', '网站', 'browser', 'web', 'url', 'browse'], workspaceMode: 'research', category: 'explore', preserved: true },
  { id: 'network', tab: 'network', nameZh: '网络中心', nameEn: 'Network Center', descriptionZh: '网络通信与连接能力', descriptionEn: 'Network connectivity and communication capabilities', intents: ['网络中心', '连接', 'vpn', '代理', 'network', 'proxy', 'wireguard'], workspaceMode: 'general', category: 'system', preserved: true },
  { id: 'knowledge', tab: 'knowledge', nameZh: '全域知识图谱', nameEn: 'Knowledge Universe', descriptionZh: '知识图谱与关联探索', descriptionEn: 'Knowledge graph and exploration', intents: ['知识图谱', '知识', '图谱', 'knowledge', 'graph'], workspaceMode: 'research', category: 'knowledge', preserved: true },
  { id: 'learning', tab: 'arabic-learning', nameZh: '语言学习', nameEn: 'Language Learning', descriptionZh: '英语与阿拉伯语学习空间', descriptionEn: 'English and Arabic learning', intents: ['学习', '学英语', '学阿拉伯语', '英语', '阿拉伯语', '语言', '课程', 'learn', 'english', 'arabic', 'study', 'lesson', 'language'], workspaceMode: 'learning', category: 'knowledge', preserved: true },
  { id: 'creator', tab: 'creator', nameZh: '创作者中心', nameEn: 'Creator Studio', descriptionZh: '内容创作与数字媒体', descriptionEn: 'Content creation and digital media', intents: ['创作', '写作', '写文章', '创作者', '写东西', 'create', 'write', 'studio', 'article'], workspaceMode: 'creation', category: 'creation', preserved: true },
  { id: 'video', tab: 'video', nameZh: '影视视频', nameEn: 'Video Center', descriptionZh: '影视与视频内容', descriptionEn: 'Video and cinema content', intents: ['视频', '影视', '电影', '看剧', '看电影', 'video', 'movie', 'film', 'watch'], workspaceMode: 'video', category: 'media', preserved: true },
  { id: 'community', tab: 'community', nameZh: '数字聚落社区', nameEn: 'Community', descriptionZh: '社区与社交能力', descriptionEn: 'Community and social capabilities', intents: ['社区', '群组', '社群', '聚落', 'community', 'group'], workspaceMode: 'general', category: 'social', preserved: true },
  { id: 'games', tab: 'game', nameZh: '游戏宇宙', nameEn: 'Games', descriptionZh: '游戏与互动娱乐', descriptionEn: 'Games and interactive entertainment', intents: ['游戏', '玩游戏', '娱乐', 'game', 'play'], workspaceMode: 'general', category: 'media', preserved: true },
  { id: 'observatory', tab: 'moon', nameZh: '天文观测', nameEn: 'Observatory', descriptionZh: '深空天文图库与观测', descriptionEn: 'Astronomy imagery and observatory', intents: ['天文', '观测', '星象', '月球', '观星', '天文台', 'astronomy', 'observatory', 'moon', 'telescope'], workspaceMode: 'research', category: 'explore', preserved: true },
  { id: 'cinema', tab: 'saturn', nameZh: '星环影院', nameEn: 'Saturn Cinema', descriptionZh: '沉浸影视娱乐空间', descriptionEn: 'Immersive cinema space', intents: ['影院', '星环', '星怀影院', 'cinema', 'saturn'], workspaceMode: 'video', category: 'media', preserved: true },
  { id: 'search', tab: 'mercury', nameZh: '全网索引与搜索', nameEn: 'Global Search', descriptionZh: '全球搜索与信息发现', descriptionEn: 'Global search and discovery', intents: ['全网搜索', '搜索资料', '查资料', '检索', 'global search', 'search info', 'find info'], workspaceMode: 'research', category: 'knowledge', preserved: true },
  { id: 'crawler', tab: 'crawler', nameZh: '发现引擎', nameEn: 'Discovery Engine', descriptionZh: '信息采集与发现能力', descriptionEn: 'Crawling and discovery engine', intents: ['采集', '爬虫', '发现引擎', 'crawler', 'discovery', '采集中心'], workspaceMode: 'research', category: 'system', preserved: true },
  { id: 'brand', tab: 'brand', nameZh: '品牌系统', nameEn: 'Brand System', descriptionZh: 'ONE 品牌与文化呈现', descriptionEn: 'Brand identity and culture system', intents: ['品牌', '品牌规划', '文化', '规范', 'brand', 'identity', 'branding'], workspaceMode: 'creation', category: 'system', preserved: true },
  { id: 'academy', tab: 'academy', nameZh: '学院', nameEn: 'Academy', descriptionZh: '学习与学院能力', descriptionEn: 'Academy and learning capabilities', intents: ['学院', 'academy'], workspaceMode: 'learning', category: 'knowledge', preserved: true },
  { id: 'settings', tab: 'settings', nameZh: '设置与安全', nameEn: 'Settings & Security', descriptionZh: '账户、安全与设置', descriptionEn: 'Account, security and settings', intents: ['设置', '安全', '账户设置', 'settings', 'security', 'account'], workspaceMode: 'general', category: 'system', preserved: true },
  { id: 'profile', tab: 'profile', nameZh: '个人主页', nameEn: 'Profile', descriptionZh: '个人资料与信标', descriptionEn: 'Profile and beacon', intents: ['个人', '资料', '个人主页', 'profile', 'me'], workspaceMode: 'general', category: 'system', preserved: true },
  { id: 'call', tab: 'call', nameZh: '通话', nameEn: 'Calls', descriptionZh: '通话能力入口', descriptionEn: 'Call capabilities', intents: ['通话入口', 'call center'], workspaceMode: 'communication', category: 'core', preserved: true },
];

export function getCapabilityByTab(tab: string): CapabilityDef | undefined {
  return CAPABILITIES.find(c => c.tab === tab);
}

export function resolveCapabilityFromIntent(text: string): CapabilityDef | undefined {
  const t = text.toLowerCase().trim();
  if (!t) return undefined;
  let best: { cap: CapabilityDef; score: number } | undefined;
  for (const cap of CAPABILITIES) {
    let score = 0;
    for (const intent of cap.intents) {
      const i = intent.toLowerCase();
      if (!i) continue;
      if (t === i) score += 12;
      else if (t.includes(i)) score += 4 + Math.min(4, i.length / 3);
      else if (i.includes(t) && t.length >= 2) score += 2;
    }
    if (score > 0 && (!best || score > best.score)) best = { cap, score };
  }
  return best && best.score >= 4 ? best.cap : undefined;
}

export function capabilityLabel(cap: CapabilityDef, lang: string): string {
  return lang === 'en' ? cap.nameEn : cap.nameZh;
}
