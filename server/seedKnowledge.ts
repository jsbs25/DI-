import { Book } from '../src/types/index.ts';

export const SEED_BOOKS: Book[] = [
  {
    id: 'book_little_prince',
    title: '小王子 · The Little Prince',
    author: '安托万·德·圣埃克苏佩里 (Antoine de Saint-Exupéry)',
    category: 'literature',
    language: 'zh',
    year: '1943',
    source: 'Open Access',
    coverImage: '/assets/library/cover-little-prince.jpg',
    description: '献给每一个曾经是孩子的大人：一段穿越 B-612 小行星、玫瑰与狐狸的温柔寓言，中英双语典藏精读本。',
    readProgress: 0,
    textAvailability: 'full_text',
    chapters: [
      {
        id: 'lp_ch1',
        title: '第一章 · 吞下大象的蟒蛇',
        content: `六岁那年，我在一本描写原始森林的书里，看见过一幅非常精彩的插画：一条大蟒蛇正在吞食一只野兽。书上写着：“蟒蛇把猎物整个吞进肚子里，连嚼都不嚼，随后就动弹不得，要整整睡上六个月来消化。”

那时候，我对丛林里的奇遇想了很久，于是用彩色铅笔画出了我的第一号作品。我把这幅杰作拿给大人们看，问他们看了以后会不会害怕。大人们回答说：“一顶帽子有什么好怕的？”

我画的根本不是帽子，而是一条正在消化大象的蟒蛇。为了能让大人们看懂，我只好又画了蟒蛇肚子的剖面图——大人们总是需要别人一遍又一遍地解释。

大人们劝我把画蟒蛇的精力收一收，不管画的是闭着肚子的还是剖开肚子的，不如多花点心思在地理、历史、算术和语法上。就这样，六岁那年，我放弃了成为伟大画家的辉煌前途。

长大以后，我改行学了开飞机，几乎飞遍了世界各地。每当我遇见一个看起来头脑还算清醒的大人，我就会拿出珍藏着的第一号作品试探他。可无论对方是男是女，回答永远都是：“这是一顶帽子。”于是我就不再跟他们谈论蟒蛇、原始森林或者星星了，只和他们聊桥牌、高尔夫、政治和领带。而他们则会非常高兴，觉得自己结识了一个如此通情达理的人。

"All grown-ups were once children... but only few of them remember it." — 每一个大人都曾经是孩子，只是很少有人还记得。`
      },
      {
        id: 'lp_ch2',
        title: '第二章 · 请给我画一只绵羊',
        content: `就这样，我孤孤单单地生活着，身边一直没有一个真正能够推心置腹交谈的人，直到六年前我在撒哈拉沙漠上空遭遇了一次迫降。我的发动机里有个零件坏了，机舱里既没有机械师，也没有乘客，我只好试着一个人完成那次艰难的修理。对我来说，这几乎是生死攸关的事，因为随身携带的饮用水最多只够维持八天。

第一天夜里，我睡在远离任何有人烟的地方足有一千英里的沙地上，比大海中央木筏上的遇难者还要孤独。所以你可以想象，当破晓时分一个细小而奇特的声音把我唤醒时，我有多么惊讶。

那个声音说：“请你……给我画一只绵羊！”

我像遭了雷击一样猛地站起身，使劲揉了揉眼睛，仔细端详着四周。我看见一个极其不寻常的小家伙，正一本正经地打量着我。在距离一切人烟一千英里的茫茫荒漠里，他既不像迷了路，也不像累坏了、饿坏了、渴坏了或吓坏了。

我画了几只绵羊，他都摇摇头：第一只病恹恹的，第二只长了角是公羊，第三只又太老了。我实在急着去修发动机，便草草画了一只带孔的木箱，对他说：“这就是箱子，你要的绵羊就在里面。”

让我大吃一惊的是，这位小小评判官的脸瞬间亮了起来：“这正是我想要的！你说，这只小羊需要吃很多草吗？”

“为什么这么问？”

“因为我住的地方非常小呀。”

就这样，我认识了小王子。`
      },
      {
        id: 'lp_ch3',
        title: '第三章 · 骄傲而脆弱的玫瑰',
        content: `在小王子的 B-612 号小行星上，本来一直长着一些非常简单的花，只有一层花瓣，不占地方，也不打扰任何人。可是有一天，不知从哪里飘来一颗种子，长出了一株与众不同的嫩芽。小王子一直守着它，它精心打扮了许多个清晨，一片一片仔细挑选着颜色，终于在一个日出时分缓缓绽放。

花朵打着哈欠说：“啊！我刚刚睡醒……真对不起……我的头发还乱蓬蓬的呢。”

小王子情不自禁地赞叹道：“你真美啊！”

花朵柔声回答：“是吗？我和太阳是同时出生的呢……”

其实她并不是一朵谦虚的花，但她却如此动人。她要求小王子每天用喷壶浇水，害怕穿堂风，于是要来一架屏风；到了晚上，还要扣上玻璃罩。小王子那时太年轻，不懂得该如何去爱她，他把她那些微不足道的赌气话当了真，心里渐渐变得非常难过。

后来他对我吐露心声：“我真不该听信她的话。永远不要光听花儿说些什么，要去看她，去闻她的芬芳。我的那朵玫瑰熏香了我的整颗星球，可我当时却不懂得享受这份幸福。我早该透过她那些笨拙的小伎俩，看到她心底的温柔。”

"It is the time you have wasted for your rose that makes your rose so important." — 正是你为你的玫瑰花费的时间，才使你的玫瑰变得如此重要。`
      },
      {
        id: 'lp_ch4',
        title: '第四章 · 狐狸与驯养的秘密',
        content: `来到地球之后，小王子走进一座盛开着五千朵玫瑰的花园，他伤心极了——他以为自己拥有宇宙中独一无二的一朵花，却发现她不过是一朵再普通不过的玫瑰。他躺在草地上哭了起来。

就在这时，一只狐狸出现在苹果树下。

“你好，”狐狸说，“来和我一起玩吧，我心里好难过。”

“我不能和你玩，”小王子说，“我还没有被驯养呢。”

“‘驯养’是什么意思？”小王子问。

“这是一个早已被人遗忘的词，”狐狸轻声解释，“它的意思是‘建立羁绊’。对我来说，你现在不过是个和十万个小男孩一模一样的小男孩，我不需要你，你也不需要我。可如果你驯养了我，我们就彼此需要了。对我来说，你就是这世界上独一无二的；对你来说，我也是这世界上独一无二的。”

狐狸继续说道：“你看那边那片麦田了吗？我不吃面包，麦子对我一点用处也没有。但你有着金黄色的头发。一旦你驯养了我，那该有多美好啊！金色的麦浪会让我立刻想起你，我甚至会爱上风吹过麦田时的沙沙声。”

临别的时候，狐狸把自己的秘密送给了小王子：“只有用心去看，才能看清事物的本质；真正重要的东西，用眼睛是看不见的。你要永远对你所驯养的一切负责，你要对你的玫瑰负责。”

"One sees clearly only with the heart. Anything essential is invisible to the eyes."`
      },
      {
        id: 'lp_ch5',
        title: '第五章 · 沙漠深处的星光与水井',
        content: `我在沙漠里熬到了第八天，最后一口水也喝完了。小王子却对我说：“我也渴了……我们去找一口井吧。”

我们在寂静的月光下走了很久。沙丘在银色的光辉中微微起伏。小王子望着满天繁星说：“沙漠之所以美丽，是因为它在某个角落里藏着一口井。”

我忽然明白了沙漠神秘光泽的来源。不管是房子、星星，还是沙漠，让它们散发出动人光芒的，都是眼睛看不见的东西。当小王子走累了在我怀里睡着时，我觉得自己抱着一件无比珍贵、又无比易碎的宝物。

天色微明时，我们真的找到了一口井。那口井不像撒哈拉常见的沙坑，倒像是村庄里的古井，井台上竟然备着滑轮、水桶和绳索。辘轳在风里吱呀作响，像一面久睡初醒的风向标。小王子亲手拉起沉甸甸的水桶，我把水送到他唇边，他闭着眼睛喝了起来。那水比寻常的饮水甘甜得多——它诞生于星光下的跋涉、滑轮的吟唱与双手的劳作，是一份献给心灵的礼物。

临行前，小王子仰望夜空微笑着对我说：“当你夜晚仰望星空的时候，因为我住在其中的一颗星星上，因为我会在那颗星星上笑着，所以对你而言，就仿佛满天的星星都在微笑。你将拥有会笑的星星。”

如果你有一天旅行到非洲的沙漠，在星空下遇见一个金发、爱笑、对所有提问从不肯放弃的小男孩，请你一定要温柔地告诉我：他回来了。`
      }
    ]
  },
  {
    id: 'book_walden',
    title: '瓦尔登湖 · Walden',
    author: '亨利·戴维·梭罗 (Henry David Thoreau)',
    category: 'literature',
    language: 'zh',
    year: '1854',
    source: 'Open Access',
    coverImage: '/assets/library/cover-walden.jpg',
    description: '在瓦尔登湖畔自建木屋独居两年零两个月，梭罗用清澈如湖水的文字记录下极简生活、自然观察与灵魂自由。',
    readProgress: 0,
    textAvailability: 'full_text',
    chapters: [
      {
        id: 'wl_ch1',
        title: '第一章 · 我为何走进森林',
        content: `我独自居住在马萨诸塞州康科德城外的森林里，离任何邻居都有一英里远，住在一间我亲手建造在瓦尔登湖畔的小木屋中，完全靠双手的劳作谋生。

我之所以走进森林，是因为我希望审慎地生活，只去面对生命中最本质的事实，看看我是否能够领悟生活所要教给我的真谛，免得在我临终之际，才发现自己根本没有真正活过。

我不想去过那种并非真正生活的生活，生命是如此珍贵；我也不愿草率地顺从辞世，除非万不得已。我要深深地生活，把生命的全部精髓都吸吮出来；我要过得笃定而简朴，把一切不属于生命本身的东西统统驱逐出去，划出宽阔的边界，贴近地面仔细收割，把生活逼到墙角，将其简化到最纯粹的形态。

我们的生命总是被琐碎的细节一点点耗尽。简化，再简化！让你的事务缩减到两三件，而不是几百上千件；不要去数到一百万，数到六就够了，账目记在你的大拇指指甲盖上就绰绰有余。

"I went to the woods because I wished to live deliberately, to front only the essential facts of life."`
      },
      {
        id: 'wl_ch2',
        title: '第二章 · 清晨与万物苏醒',
        content: `每一个清晨都是一次愉悦的邀请，邀我让自己的生命与大自然本身一样质朴，我想也可以说，一样纯真。我像古希腊人一样虔诚地迎候黎明。我起得很早，在湖中沐浴——那是一种宗教仪式，也是我一天中所做的最美好的事之一。

早晨把英雄时代重新带回人间。当蚊虫在清晨的空气里嗡嗡作响，在房间里穿梭往来时，那声音对我的触动不亚于任何号角，它宣示着这片宇宙无穷的活力与生机。

清晨是一天中最令人难忘的时刻，是一切清醒的开端。唯有真正醒着的时候，黎明才会降临。未来还有更多的日子等待破晓，太阳不过是一颗晨星。

我们在白昼的喧嚣里往往陷入半梦半醒的惯性，把钟表的滴答声误认作生命的脉搏。然而当我坐在松木门槛上，听见松鼠在树梢轻跃，看见薄雾像白色的纱幔一样从湖面缓缓升起，我便感到一种超越时间的宁静。`
      },
      {
        id: 'wl_ch3',
        title: '第三章 · 独处与湖畔声响',
        content: `这是一个令人愉快的黄昏，整个身体仿佛化作单一的感官，每一寸毛孔都在呼吸着喜悦。我以奇异的自由穿梭于自然之中，成为她的一部分。

我从未找到过比独处更好的伴侣。大多数时候，当我们置身人群之中，反而比独自待在房间里还要孤独。思想或劳作的人，无论身在何处，始终都是独自一人的。孤独不能以人与人之间相隔多少英里来衡量。

夜色渐深时，湖面像一面深蓝色的琉璃镜，把天上的星群完整地收入怀中。偶尔有远处火车的汽笛声掠过树林，提醒着我现代工业的节奏；但很快，树影重新合拢，夜莺的清啼与湖水轻拍鹅卵石的节拍又成为天地间唯一的主角。

大自然最慷慨之处在于，她从不向倾听者收取门票。只要你肯放慢脚步，微风、松涛、雨滴与日光，都是免费而丰盛的盛宴。`
      },
      {
        id: 'wl_ch4',
        title: '第四章 · 春日解冻与结束语',
        content: `春天最先在铁路沿线的沙坡上显露踪迹。融化的沙土与冰雪顺着斜坡流淌下来，勾勒出类似树叶、藤蔓、血管与河流三角洲的纹路。大自然仿佛在用湿润的泥土向我们展示她创造万物时的草图——大地并非死寂的矿石，而是一首活生生、正在呼吸的诗歌。

当瓦尔登湖厚重的冰层发出雷鸣般的爆裂声，湛蓝的湖水重新拥抱阳光，冬日所有的沉重都在顷刻间化作轻盈的涟漪。

如果一个人没有与同伴保持同样的步调，也许是因为他听见了另一位鼓手的节拍。让他随着自己听见的乐声前进吧，无论那节拍是急促还是遥远。一个人如果自信地朝着自己梦想的方向迈进，努力去过自己想象中的生活，他就会在不经意间遇见意想不到的成功。

我离开森林，正如我当初走进森林一样有着同样充分的理由。也许我觉得自己还有好几种别样的人生要去体验，不能把全部时间都只用来过这一种。`
      }
    ]
  },
  {
    id: 'book_meditations',
    title: '沉思录 · Meditations',
    author: '马可·奥勒留 (Marcus Aurelius)',
    category: 'philosophy',
    language: 'zh',
    year: 'c. 170–180 AD',
    source: 'Open Access',
    coverImage: '/assets/library/cover-meditations.jpg',
    description: '罗马皇帝在军帐灯火下写给自己的十二卷心灵日记，斯多葛哲学最澄澈的力量之源：掌控内心，安住当下。',
    readProgress: 0,
    textAvailability: 'full_text',
    chapters: [
      {
        id: 'md_ch1',
        title: '卷二 · 清晨对自己的提醒',
        content: `清晨醒来时，先对自己说：今天我将遇到爱管闲事的人、忘恩负义的人、傲慢的人、狡诈的人、嫉妒的人和不合群的人。他们之所以如此，是因为他们分辨不清什么是真正的善与恶。

而我既然已经领悟了善的本质在于美，恶的本质在于丑，也明白了犯错的人在本性上与我同源——并非因为相同的血脉，而是因为我们共享同一种理性与神圣的火花——那么他们中的任何人都无法真正伤害我，因为没有人能把丑恶强加在我的灵魂之上。

你无法控制外界的风浪，但你永远拥有对自己心灵的绝对主权。认识到这一点，你便找到了真正的力量。

"You have power over your mind — not outside events. Realize this, and you will find strength."`
      },
      {
        id: 'md_ch2',
        title: '卷四 · 内心的城堡',
        content: `人们常常在乡间别墅、海滨或深山之中寻找隐居之所，你也曾同样渴望这样的去处。然而这其实是最寻常的误解，因为你随时随地都可以退回到你自己的心灵之中。

没有什么地方比一个人自己的灵魂更宁静、更少纷扰——尤其是当他内心蕴藏着清明而正确的信念，只要凝神一望，立刻就能恢复彻底的安宁。所谓安宁，无非就是心灵秩序的井然。

请时常赐予自己片刻这样的退隐，在那里更新自己。让你的原则简明而根本，只要想起它们，就能立刻洗去一切烦忧，让你平静地回到眼前的责任之中。

抹去多余的臆测，你就抹去了“我受了伤害”的念头；抹去了“我受了伤害”的念头，伤害本身也就随之消散了。`
      },
      {
        id: 'md_ch3',
        title: '卷五 · 成为顺应天性的行动者',
        content: `清晨当你赖在温暖的被窝里不想起身时，请随时准备好这样的念头：“我是为了履行一个人的天职而醒来的。既然我生来就是为了完成这些工作，为什么还要心生抱怨呢？难道我来到世上，只是为了躲在被子里取暖吗？”

看看那些小鸟、蚂蚁、蜘蛛与蜜蜂吧，它们各自勤勉地编织着属于自己的宇宙秩序。而你，竟不愿去做一个人类该做的事吗？

妨碍行动的障碍，本身会推进你的行动；横亘在道路上的阻碍，最终将成为道路本身。

"The impediment to action advances action. What stands in the way becomes the way."`
      },
      {
        id: 'md_ch4',
        title: '卷七 · 凝视群星与当下',
        content: `你的生命之光，取决于你思想的品质。不要再空谈一个好人应该是什么样子，直接去成为那样的人。

仰望星辰运转的轨迹吧，想象自己正与它们一同周行不息，并时常思索元素之间彼此流转的变化。这样的观照能够洗去尘世琐屑的尘埃。

不要把注意力浪费在已经流逝的昨天，也不要被尚未到来的明天搅乱心神。任何人所能失去的，永远只有“当下”这一刻——因为你无法失去你尚未拥有的未来，也无法失去早已逝去的过去。把眼前的这一刻做好，以正直、清明与善意度过它，这便足够圆满。`
      }
    ]
  },
  {
    id: 'book_daodejing',
    title: '道德经 · Dao De Jing',
    author: '老子 (Laozi)',
    category: 'philosophy',
    language: 'zh',
    year: 'c. 4th Century BC',
    source: 'Open Access',
    coverImage: '/assets/library/cover-walden.jpg',
    description: '东方哲学的源头活水，五千言纵论天道自然、上善若水、致虚守静与无为而治，附现代白话精读与思考。',
    readProgress: 0,
    textAvailability: 'full_text',
    chapters: [
      {
        id: 'ddj_ch1',
        title: '第一章 · 道可道，非常道',
        content: `道可道，非常道；名可名，非常名。
无名，天地之始；有名，万物之母。
故常无欲，以观其妙；常有欲，以观其徼。
此两者，同出而异名，同谓之玄。玄之又玄，众妙之门。

【现代精读】
能够用固定语言完全框定的规律，就不再是生生不息、永恒流转的终极之道；能够用有限概念封存的名称，也不再是涵盖万象的永恒之名。在尚未被切割命名之前，世界是浑然一体的本源；当人类赋予万物名字，千姿百态的秩序由此展开。

放下执念与功利之心，才能体会天地隐微的奥妙；带着好奇与关切去观察，才能看见万物运行的边界。有与无本是一体两面，深邃幽远，正是一切智慧与创造力的入口。`
      },
      {
        id: 'ddj_ch2',
        title: '第八章 · 上善若水',
        content: `上善若水。水善利万物而不争，处众人之所恶，故几于道。
居善地，心善渊，与善仁，言善信，政善治，事善能，动善时。
夫唯不争，故无尤。

【现代精读】
最高境界的善，就像自然界的水一样。水润泽万物，让草木生发、江河奔流，却从不与万物争抢功名，甘于流向人们往往忽视的低洼之处，因此最接近“道”的品格。

在生活与处世中，像水一样：选址顺应自然，心境像深潭般沉静澄澈，待人温和仁善，言语诚实守信，治理井井有条，做事发挥专长，行动把握恰当时机。正因为不陷入无谓的争斗与内耗，才能从容无怨、行稳致远。`
      },
      {
        id: 'ddj_ch3',
        title: '第十六章 · 致虚极，守静笃',
        content: `致虚极，守静笃。万物并作，吾以观复。
夫物芸芸，各复归其根。归根曰静，静曰复命。复命曰常，知常曰明。
不知常，妄作凶。知常容，容乃公，公乃全，全乃天，天乃道，道乃久，没身不殆。

【现代精读】
让心灵达到极致的清澈虚明，让心神安住于深沉的宁静之中。看世间万物蓬勃生长、往来起伏，我们静观它们循环往复的节奏。纷繁喧嚣的万物，最终都会回归各自的根本；回归根本就是宁静，宁静就是回到生命的本真状态。

懂得恒常的规律，内心就拥有清明与包容；能包容，便能公正坦荡；公正坦荡，才能圆融周全、长久安宁。`
      },
      {
        id: 'ddj_ch4',
        title: '第三十三章 · 知人者智，自知者明',
        content: `知人者智，自知者明。
胜人者有力，自胜者强。
知足者富，强行者有志。
不失其所者久，死而不亡者寿。

【现代精读】
能够洞察他人的人是聪明的，能够真正看清自己的人才是通透光明的。能战胜对手的人拥有力量，能克制并超越自我弱点的人才是真正的强者。

懂得珍惜当下、内心知足的人才是真正富足的；坚定不移、持续践行理想的人才是真正有志气的。守住内心的安身立命之所，就能长久稳固；精神与价值能被后人铭记，便是真正的长寿。`
      },
      {
        id: 'ddj_ch5',
        title: '第六十四章 · 千里之行，始于足下',
        content: `其安易持，其未兆易谋；其脆易泮，其微易散。为之于未有，治之于未乱。
合抱之木，生于毫末；九层之台，起于累土；千里之行，始于足下。
民之从事，常于几成而败之。慎终如始，则无败事。

【现代精读】
局势安稳时容易维持，问题尚未显露苗头时最容易化解。参天大树是从细小的嫩芽长成的，九层高台是从一筐筐泥土筑起的，千里的远行是从脚下第一步开始的。

人们做事，往往在快要成功的时候因为松懈而功亏一篑。如果结尾的时候也能像刚开始那样专注审慎，便没有做不成的事。`
      }
    ]
  },
  {
    id: 'book_arabian_nights',
    title: '一千零一夜 · ألف ليلة وليلة',
    author: '中东与阿拉伯民间古典文学经典',
    category: 'islamic_studies',
    language: 'ar',
    year: 'c. 9th–14th Century',
    source: 'Open Access',
    coverImage: '/assets/library/cover-arabian-nights.jpg',
    description: '巴格达星夜下的智慧与勇气：山鲁佐德用一千零一个故事点亮黎明，收录辛巴达航海与智慧寓言，中阿双语精读。',
    readProgress: 0,
    textAvailability: 'full_text',
    chapters: [
      {
        id: 'an_ch1',
        title: 'الليلة الأولى · 第一夜：山鲁佐德的星夜故事',
        content: `في قديم الزمان وسالف العصر والأوان، كانت شهرزاد فتاةً حكيمةً قد قرأت الكتب والتواريخ وسير الملوك المتقدمين وأخبار الأمم الماضين.

在遥远的古代，巴格达的星空下，有一位博学而勇敢的女子名叫山鲁佐德。她熟读历代典籍、诗歌、医学与诸国史话，深知唯有故事中的善意、好奇与想象力，才能融化冰冷的恐惧。

每当夜幕降临，宫廷的琉璃灯次第亮起，她便以平静清亮的声音讲述大海彼岸的航船、沙漠深处的绿洲、会说话的飞鸟与恪守诺言的旅人。而每到故事最扣人心弦的转折处，东方恰好泛起第一缕晨光，于是国王屏息等待着下一个夜晚。

就这样，一夜又一夜，智慧战胜了偏执，语言成为了连接不同灵魂的桥梁。`
      },
      {
        id: 'an_ch2',
        title: 'رحلة السندباد الأولى · 辛巴达的第一次航海',
        content: `اعلموا يا سادة يا كرام أنني كنت في شبابي شغوفاً بالسفر واكتشاف الجزر البعيدة والبحار الواسعة.

各位尊贵的听众啊，我年轻时便热爱扬帆远航，渴望亲眼见识海天相接之处的岛屿与城邦。我带着来自巴格达的香料、丝绸与细瓷，同商队的伙伴们从巴士拉港启航，乘着和煦的季风驶向蔚蓝的印度洋。

航行了许多个昼夜之后，我们在海面上望见一座绿草如茵、开满野花的小岛。船长下锚停泊，众人欢呼着登上岛屿生火做饭。谁知那座“岛屿”竟然是一头沉睡百年的巨鲸背脊，因为长期静止不动，风沙与种子在它背上长成了草坪！火焰的温度惊醒了巨鲸，它缓缓沉入波涛之中。

危急关头，我抱住一块随浪漂来的大木桶，在星空与潮汐的护佑下漂流了一天一夜，最终被海浪温柔地推上一座繁华岛屿的海岸。那里的国王欣赏我的见识与诚实，任命我掌管港口事务。直到后来，我原来的商船再次驶入港湾，我认出了自己箱笼上的徽记，带着双倍的财富与更开阔的胸怀，平安回到了巴格达。`
      },
      {
        id: 'an_ch3',
        title: 'حكاية الصياد والكنز · 渔夫与星辰的智慧',
        content: `خرج صيادٌ فقيرٌ عند الفجر إلى شاطئ البحر، وألقى شبكته ثلاث مرات وهو يثق بأن الصبر مفتاح الفرج.

清晨微凉，一位年迈而诚实的渔夫来到海边。他每天只撒四次网，从不贪多。前三次拉网，网里只有碎石、海藻与泥沙；到了第四次，他默念着感恩与耐心撒下渔网，竟然捞起一只镌刻着古老星象花纹的黄铜宝瓶。

打开铜瓶之后，故事里的考验接踵而至——面对庞大而骄傲的精灵，渔夫没有惊慌失措，也没有屈服，而是用冷静的提问与巧妙的机智化解了危局。

这个流传千年的故事告诉我们：真正的力量从来不在于身躯是否高大，而在于危机降临时，你能否保持一颗沉静、清明、善于思考的心。`
      },
      {
        id: 'an_ch4',
        title: 'بوابة بغداد والنجوم · 巴格达的灯火与智慧之城',
        content: `وفي ليالي بغداد الهادئة، كانت المكتبات والأسواق تزدهر بالعلم والشعر والموسيقى من كل أنحاء الأرض.

在宁静的巴格达之夜，智慧宫的书灯彻夜未眠。来自波斯、印度、希腊与丝绸之路东方的学者们围坐在拱廊下，共同翻译天文学典籍、讨论几何与星图、品尝带着豆蔻香气的咖啡。

《一千零一夜》之所以跨越千年仍被全世界传颂，正是因为它把不同文明的善意、勇气与好奇心编织在了一起：只要你还愿意倾听一个新的故事，黑夜终将迎来温柔的黎明。`
      }
    ]
  },
  {
    id: 'book_zhuangzi',
    title: '庄子 · 逍遥游与秋水',
    author: '庄周 (Zhuangzi)',
    category: 'philosophy',
    language: 'zh',
    year: 'c. 3rd Century BC',
    source: 'Open Access',
    coverImage: '/assets/library/cover-walden.jpg',
    description: '中国文学与哲学中最瑰丽自由的想象篇章：北冥鲲鹏、河伯望洋、庄周梦蝶，带你飞出局促，拥抱浩瀚天地。',
    readProgress: 0,
    textAvailability: 'full_text',
    chapters: [
      {
        id: 'zz_ch1',
        title: '内篇 · 逍遥游（北冥有鱼）',
        content: `北冥有鱼，其名为鲲。鲲之大，不知其几千里也；化而为鸟，其名为鹏。鹏之背，不知其几千里也；怒而飞，其翼若垂天之云。是鸟也，海运则将徙于南冥——南冥者，天池也。

《齐谐》者，志怪者也。《谐》之言曰：“鹏之徙于南冥也，水击三千里，抟扶摇而上者九万里，去以六月息者也。”野马也，尘埃也，生物之以息相吹也。天之苍苍，其正色邪？其远而无所至极邪？其视下也，亦若是则已矣。

【赏析】
庄子开篇便推开了一扇通向宇宙尺度的巨窗。大鹏振翅击水三千里、乘风直上九万里，从高空俯瞰人间，便如同我们在地面仰望苍茫青天。境界越开阔，越不会被眼前的得失与狭隘的评判所束缚——这便是“逍遥”的起点。`
      },
      {
        id: 'zz_ch2',
        title: '内篇 · 齐物论（庄周梦蝶）',
        content: `昔者庄周梦为胡蝶，栩栩然胡蝶也，自喻适志与！不知周也。俄然觉，则蘧蘧然周也。不知周之梦为胡蝶与，胡蝶之梦为周与？周与胡蝶，则必有分矣。此之谓物化。

【赏析】
这一段短短几十个字，成为了东方美学最具诗意的意象之一。当庄周梦见自己化作一只翩翩起舞的蝴蝶，轻盈自在、忘却尘俗烦恼；忽然醒来，又惊讶地发现自己仍是庄周。究竟是庄周在梦中变成了蝴蝶，还是蝴蝶在梦里变成了庄周？

庄子用轻灵的蝴蝶提醒我们：放下僵硬的我执，学会以更柔和、更开放的眼光看待世界与自我，你便能感受到万物相融的自由。`
      },
      {
        id: 'zz_ch3',
        title: '外篇 · 秋水（望洋兴叹）',
        content: `秋水时至，百川灌河。泾流之大，两涘渚崖之间，不辩牛马。于是焉，河伯欣然自喜，以天下之美为尽在己。顺流而东行，至于北海。东面而视，不见水端。于是焉，河伯始旋其面目，望洋向若而叹。

北海若曰：“井蛙不可以语于海者，拘于虚也；夏虫不可以语于冰者，笃于时也；曲士不可以语于道者，束于教也。今尔出于崖涘，观于大海，乃知尔丑，尔将可与语大理矣。”

【赏析】
真正的成长，往往始于走出熟悉的河岸、亲眼看见更广阔的大海。承认自己的局限并非软弱，恰恰是走向真正大格局与真智慧的开始。`
      },
      {
        id: 'zz_ch4',
        title: '外篇 · 濠梁之辩（子非鱼）',
        content: `庄子与惠子游于濠梁之上。庄子曰：“鲦鱼出游从容，是鱼之乐也。”

惠子曰：“子非鱼，安知鱼之乐？”

庄子曰：“子非我，安知我不知鱼之乐？”

惠子曰：“我非子，固不知子矣；子固非鱼也，子之不知鱼之乐，全矣。”

庄子曰：“请循其本。子曰‘汝安知鱼乐’云者，既已知吾知之而问我，我知之濠上也。”

【赏析】
惠子讲求严密的逻辑推演，而庄子则以一颗敏锐喜悦的心与自然共鸣。当你站在阳光温暖的桥上，看着清澈溪水中的游鱼自在穿梭，内心涌起的欢喜不需要繁复的证明——你就在濠水之上，亲身感受到了这份快乐。`
      }
    ]
  },
  {
    id: 'book_pride',
    title: '傲慢与偏见 · Pride and Prejudice',
    author: '简·奥斯汀 (Jane Austen)',
    category: 'literature',
    language: 'en',
    year: '1813',
    source: 'Project Gutenberg',
    coverImage: '/assets/library/cover-meditations.jpg',
    description: '简·奥斯汀最具锋芒与温情的经典小说，围绕伊丽莎白与达西的误解与醒悟，细腻刻画人性、尊严与真挚爱情。',
    readProgress: 0,
    textAvailability: 'full_text',
    chapters: [
      {
        id: 'pp_ch1',
        title: 'Chapter 1 · A Truth Universally Acknowledged',
        content: `It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.

However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered the rightful property of some one or other of their daughters.

"My dear Mr. Bennet," said his lady to him one day, "have you heard that Netherfield Park is let at last?"

Mr. Bennet replied that he had not.

"But it is," returned she; "for Mrs. Long has just been here, and she told me all about it."

Mr. Bennet made no answer.

"Do you not want to know who has taken it?" cried his wife impatiently.

"You want to tell me, and I have no objection to hearing it." This was invitation enough.

【中文导读】
凡是有财产的单身汉，必定需要娶位太太，这已经成了一条举世公认的真理。奥斯汀用轻快反讽的开篇，瞬间勾勒出朗伯恩镇的乡绅风情与班纳特夫妇鲜明有趣的性格反差。`
      },
      {
        id: 'pp_ch2',
        title: 'Chapter 3 · The Meryton Assembly',
        content: `Mr. Bingley had soon made himself acquainted with all the principal people in the room; he was lively and unreserved, danced every dance, was angry that the ball closed so early, and talked of giving one himself at Netherfield.

What a contrast did he present to his friend Mr. Darcy! Mr. Darcy soon drew the attention of the room by his fine, tall person, handsome features, noble mien, and the report which was in general circulation within five minutes after his entrance, of his having ten thousand a year.

The gentlemen pronounced him to be a fine figure of a man, the ladies declared he was much handsomer than Mr. Bingley, and he was looked at with great admiration for about half the evening, till his manners gave a disgust which turned the tide of his popularity; for he was discovered to be proud, to be above his company, and above being pleased.

Elizabeth Bennet had been obliged, by the scarcity of gentlemen, to sit down for two dances; and during part of that time, Mr. Darcy had been standing near enough for her to hear a conversation between him and Mr. Bingley, in which Darcy remarked that she was "tolerable, but not handsome enough to tempt me." Elizabeth remained with no very cordial feelings toward him, yet told the story with great spirit among her friends—for she had a lively, playful disposition, which delighted in anything ridiculous.`
      },
      {
        id: 'pp_ch3',
        title: 'Chapter 36 · The Awakening of Understanding',
        content: `When Elizabeth read Mr. Darcy's letter for the second time, her astonishment gave way to reflection. Every line forced her to re-examine impressions she had once considered beyond doubt.

"How despicably have I acted!" she cried. "I, who have prided myself on my discernment! I, who have valued myself on my abilities! How humiliating is this discovery! Yet, how just a humiliation! Till this moment, I never knew myself."

True clarity often arrives not when we prove ourselves right, but when we find the courage to admit where our own pride and prejudice blinded us. From that quiet afternoon in the lane, both Darcy and Elizabeth began the honest work of seeing each other as they truly were.`
      },
      {
        id: 'pp_ch4',
        title: 'Chapter 58 · Walking Together Beyond Pride',
        content: `"You taught me a lesson, hard indeed at first, but most advantageous," said Mr. Darcy as they walked along the quiet country lane. "By you, I was properly humbled. I came to you without a doubt of my reception. You showed me how insufficient were all my pretensions to please a woman worthy of being pleased."

Elizabeth smiled gently and replied that they had both grown wiser through their mistakes—he in laying aside aloofness, and she in tempering hasty judgment.

The morning air was crisp, the hills stretched bright beneath an open sky, and what had begun in sharp wit and misunderstanding matured into an enduring partnership built on mutual respect.`
      }
    ]
  },
  {
    id: 'book_art_of_war',
    title: '孙子兵法 · The Art of War',
    author: '孙武 (Sun Tzu)',
    category: 'history',
    language: 'zh',
    year: 'c. 5th Century BC',
    source: 'Open Access',
    coverImage: '/assets/library/cover-meditations.jpg',
    description: '世界兵学与战略思维的巅峰典籍：从“不战而屈人之兵”到“知彼知己”，蕴含跨越两千五百年的系统决策智慧。',
    readProgress: 0,
    textAvailability: 'full_text',
    chapters: [
      {
        id: 'aow_ch1',
        title: '始计第一 · 五事七计',
        content: `孙子曰：兵者，国之大事，死生之地，存亡之道，不可不察也。

故经之以五事，校之以计，而索其情：一曰道，二曰天，三曰地，四曰将，五曰法。道者，令民与上同意也，故可以与之死，可以与之生，而不畏危。天者，阴阳、寒暑、时制也。地者，远近、险易、广狭、死生也。将者，智、信、仁、勇、严也。法者，曲制、官道、主用也。

夫未战而庙算胜者，得算多也；未战而庙算不胜者，得算少也。多算胜，少算不胜，而况于无算乎！吾以此观之，胜负见矣。

【战略启示】
真正的胜算往往早在行动开始之前就已决定。在开启任何重要事业之前，冷静盘点愿景共识（道）、时代趋势（天）、环境条件（地）、核心领导力（将）与组织制度（法），胜负格局自然清晰可见。`
      },
      {
        id: 'aow_ch2',
        title: '谋攻第三 · 不战而屈人之兵',
        content: `夫用兵之法，全国为上，破国次之；全军为上，破军次之。是故百战百胜，非善之善者也；不战而屈人之兵，善之善者也。

故上兵伐谋，其次伐交，其次伐兵，其下攻城。攻城之法，为不得已。

故曰：知彼知己，百战不殆；不知彼而知己，一胜一负；不知彼，不知己，每战必殆。

【战略启示】
最高明的智慧不是硬碰硬地消耗彼此，而是通过洞见全局、建立合作与精准谋划，以最小代价达成最圆满的结果。既看清外部格局，也诚实了解自身边界，才能立于不败之地。`
      },
      {
        id: 'aow_ch3',
        title: '军形第四 · 先为不可胜',
        content: `孙子曰：昔之善战者，先为不可胜，以待敌之可胜。不可胜在己，可胜在敌。故善战者，能为不可胜，不能使敌之必可胜。故曰：胜可知，而不可为。

善战者之胜也，无智名，无勇功。故其战胜不忒。不忒者，其所措必胜，胜已败者也。故善战者，立于不败之地，而不失敌之败也。

【战略启示】
先把自己的根基打牢，做到稳健、扎实、无懈可击（不可胜在己），然后耐心等待最佳时机到来。真正的高手追求的不是惊险翻盘，而是步步为营、水到渠成的确定性。`
      },
      {
        id: 'aow_ch4',
        title: '虚实第六 · 兵形象水',
        content: `夫兵形象水，水之形，避高而趋下；兵之形，避实而击虚。水因地而制流，兵因敌而制胜。

故兵无常势，水无常形，能因敌变化而取胜者，谓之神。故五行无常胜，四时无常位，日有短长，月有死生。

【战略启示】
世界与市场永远在流动变化，没有一成不变的固定招式。像水流顺应山川地形一样，根据真实形势灵活调整策略，把精力聚焦在最关键的突破口上，便是活用的最高境界。`
      }
    ]
  },
  {
    id: 'book_republic',
    title: '理想国 · The Republic',
    author: '柏拉图 (Plato)',
    category: 'philosophy',
    language: 'en',
    year: 'c. 375 BC',
    source: 'Project Gutenberg',
    coverImage: '/assets/library/cover-meditations.jpg',
    description: '西方哲学的奠基对话录：苏格拉底与友人深入探讨正义的本质、城邦治理、教育理念以及震撼千年的“洞穴之喻”。',
    readProgress: 0,
    textAvailability: 'full_text',
    chapters: [
      {
        id: 'rep_ch1',
        title: 'Book I · The Nature of Justice',
        content: `I went down yesterday to the Piraeus with Glaucon the son of Ariston, that I might offer up my prayers to the goddess; and also because I wanted to see in what manner they would celebrate the festival, which was a new thing.

Socrates is challenged by Cephalus, Polemarchus, and Thrasymachus on what justice truly constitutes. Thrasymachus aggressively argues that "justice is nothing else than the interest of the stronger."

Socrates proceeds with patient dialectic inquiry: Does a true physician prescribe medicine for his own private gain or for the bodily well-being of the patient? Does a true captain steer the ship for himself, or for the safety of every voyager aboard? In like manner, no ruler or craftsman, insofar as he exercises his craft rightly, considers his own advantage alone, but the flourishing of those in his care. Justice is therefore not the tyranny of might, but the inner harmony of wisdom, courage, and moderation.`
      },
      {
        id: 'rep_ch2',
        title: 'Book VII · The Allegory of the Cave',
        content: `And now, I said, let me show in a figure how far our nature is enlightened or unenlightened: Behold! human beings living in an underground den, which has a mouth open towards the light and reaching all along the den; here they have been from their childhood, and have their legs and necks chained so that they cannot move, and can only see before them.

Above and behind them a fire is blazing at a distance, and between the fire and the prisoners there is a raised way; and you will see, if you look, a low wall built along the way, like the screen which marionette players have in front of them, over which they show the puppets.

The prisoners see only their own shadows, or the shadows of one another, which the fire throws on the opposite wall of the cave. To them, the truth would be literally nothing but the shadows of the images.

When one prisoner is liberated and guided up the steep ascent into the open daylight, his eyes are dazzled at first; yet gradually he discerns reflections in water, then trees and mountains, then the night sky, and at last the Sun itself—the Form of the Good, the ultimate source of light, beauty, and truth.`
      },
      {
        id: 'rep_ch3',
        title: 'Book VII · Turning the Soul Toward Light',
        content: `Education, then, is not what some professors declare it to be—they say they can put knowledge into a soul which was not there before, as if putting sight into blind eyes.

Our inquiry shows rather that the power and capacity of learning already exists within the soul. Just as the eye cannot turn from darkness to light without turning the whole body, so the instrument of knowledge must be turned away from fleeting appearances until the soul is able to endure the contemplation of enduring truth.

Thus education is the art of turning the mind in the right direction—awakening curiosity, clarity, and responsibility for the common good.`
      }
    ]
  },
  {
    id: 'book_copernicus',
    title: '天体运行论与星空史话 · De Revolutionibus',
    author: '尼古拉·哥白尼 (Nicolaus Copernicus)',
    category: 'science',
    language: 'en',
    year: '1543',
    source: 'Internet Archive',
    coverImage: '/assets/library/cover-little-prince.jpg',
    description: '现代天文学的黎明之作：哥白尼以优雅而勇敢的几何洞察，重新描绘地球与群星绕日而行的壮丽宇宙图景。',
    readProgress: 0,
    textAvailability: 'full_text',
    chapters: [
      {
        id: 'cop_ch1',
        title: 'Book I · The Universe is Spherical',
        content: `In the first place, we must observe that the universe is spherical; either because that form is the most perfect of all, requiring no join, but being a self-contained whole; or because it is the most spacious form, the most suitable for containing and preserving all things.

We witness this same love of spherical harmony everywhere in nature—in the Sun, the Moon, the planets, and even in a single drop of morning dew striving to bound itself into a luminous sphere.`
      },
      {
        id: 'cop_ch2',
        title: 'Book I · The Motion of the Earth',
        content: `Why do we hesitate to grant the earth that power of movement which belongs to its spherical form, rather than disturb the whole cosmos, whose boundaries are unknown and unknowable?

Whenever a ship glides gently away from harbor across calm water, every shoreline house and distant hill appears to sail backward while the vessel feels motionless. So too, as the Earth turns quietly upon its axis each day and traces its grand annual orbit, the starry heavens seem to wheel around us in solemn majesty.`
      },
      {
        id: 'cop_ch3',
        title: 'Book I · The Sun Enthroned at the Center',
        content: `In the center of all rests the Sun. For who would place this lamp of a most beautiful temple in another or better place than this, wherefrom it can illuminate the whole at the same time?

As on a royal throne, the Sun governs the family of worlds revolving about it. In this arrangement we discover a marvelous symmetry of the universe and a definite harmonious linkage between the motion of the spheres and their size—an elegance that invites humanity to keep looking upward with wonder.`
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
