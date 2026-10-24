import type { Geography } from './model'

/**
 * 「建安十三年（新）」的地理数据，从头重做，正在逐点搭建。
 * 眼下是荆州一隅与扬州东端的柴桑：赤壁战后，刘备据公安，曹操守江陵、襄阳、樊城、宛城与夷陵，孙权据柴桑，
 * 赤壁是无归属的野地，秭归是无归属的小城；荆南四郡（武陵、长沙、零陵、桂阳）自成一家的「荆南」势力所据——
 * 四郡名义上属曹操，但曹军隔着公安一线，刘备南下取四郡时北军顾及不及，
 * 故另立一家，与曹操无涉。赤壁当荆扬之间，江陵、公安、长沙、柴桑皆通于此，江北的江夏又与之隔江相接，四家共临；
 * 江夏（夏口）眼下无归属，是长江中游的一处无主据点，西临赤壁、东接柴桑。
 * 扬州另有合肥与京口：合肥属曹操，京口、建业、吴、会稽与濡须属孙权。濡须是孙权设在江北的关隘、江东的北门户，
 * 曹操自合肥南下入江东必先夺此口，眼下是一处空关；建业在江东，与京口相接，
 * 吴是吴郡治吴县、孙氏本郡，在江东腹地、京口之东，会稽是会稽郡治山阴、在吴之南，
 * 诸地皆由孙权所据。
 * 柴桑又同在长江南岸，水军顺流东下即入建业，濡须亦由建业转接。
 * 庐江郡的皖城归曹操，与合肥、濡须、柴桑皆直连。淮南另有寿春与广陵，皆归曹操：寿春是淮南重镇，南接合肥、北接谯、东通广陵，
 * 谯在许都与寿春之间，是曹操自许都南下淮南的第一站；
 * 徐州另有彭城，是州治、归曹操，北接谯、南连寿春，许都东出徐州由此；
 * 广陵隔江与京口相望、是江东出入江北的渡口。关中另有槐里、陈仓、长安与潼关四点：
 * 槐里在西，是马腾设在关中的大本营；长安、潼关与陈仓在东属曹操，两家在关中相望。
 * 马腾与陇右的韩遂合为一家，金城在其西、由韩遂驻守，西出湟水谷地的西平关。
 * 陇右自西向东是 金城—天水—祁山 一线，天水东出街亭而入陈仓，街亭由是陇右门户；天水郡治冀县、眼下无归属，祁山是南下武都的野地。
 * 陇右之南另有武都一郡，无归属：武都郡治下辨，当祁山道的枢纽，北接祁山、东接阳平关。
 * 关中出入有三路：西出经街亭，西南经陈仓道入汉中，南经子午道抵南郑。南下荆州则只经潼关—洛阳—宛城一线，与扬州之间暂无通路。官渡之后袁氏已亡，河北与中原尽入曹操之手：
 * 洛阳据天下之中、虎牢关扼其东，陈留与许都分居兖、豫而许都为汉廷所在，邺是河北重镇——洛阳—虎牢关—许都/陈留
 * 串成中原一线，邺则经陈留南下；宛城为南阳郡治，自洛阳、许都南下接樊城与襄阳，中原由是与荆州相通。
 * 幽州东端的辽东另有公孙康一家，据襄平自守，柳城与右北平在其西、是西出幽州的两处中转，蓟是幽州治所、归曹操，
 * 襄平西出蓟而抵邺，辽东只此一条出入之路。汉中另有张鲁一家：
 * 南郑为其所居，阳平关扼其西路，是汉中腹地与西面门户；南郑又北经子午谷直抵长安，东出荆州则须借道巴东。
 * 阳平关险不可拔，沔阳之南的定军山却是无归属的野地，
 * 与南缘的葭萌关相通，是自南面绕开关隘、北上取汉中的一路。益州另有刘璋一家：成都为其所居，
 * 北面隔着雒城、绵竹与涪城三座城池，涪城为大城、雒城与绵竹为小城，绵竹当涪城与雒城之间的大道，葭萌关则是汉中南入益州的关口、南出即至涪城，
 * 归刘璋——两家在关前相望。巴郡另有江州与白帝城，皆归刘璋：江州居涪城之南，
 * 白帝城当三峡之口，隔江与夷陵相望，其间又有秭归为县城、眼下无归属，是荆州溯江入益州的门户——涪城—江州—白帝城—秭归—夷陵连成一线，
 * 益州由是与荆州相通，汉中则经葭萌关入益州、再接上此线。南中自成一家的「南蛮」以三江城为据、孟获为王；
 * 泸水是蜀军南渡金沙江处的无主野地，秃龙洞与三江城是南中的毒泉险地与屏障，桃花渡则是兀突骨屯藤甲兵的渡口，皆无归属。
 * 成都—泸水—秃龙洞—三江城—桃花渡串成一线，是自蜀中出入南中的一路，亦合《演义》南征的行军次序。
 * 交州另有士燮一家，兄弟分守番禺、广信、合浦、龙编与九真五郡，沿海南北连成一线：广信是苍梧郡治、
 * 居番禺与合浦之间；番禺北接荆南的桂阳，交州与荆南由此相通；
 * 会稽在江东，南出东冶、海路入番禺，孙权由是与交州相接。
 * 至此中原与关中皆可南下荆州，扬州则仍是一隅。
 * 州界定归属、战略点再落到州上，是逐个补入的顺序；州界与地形的轮廓另有出处（mapData.ts），
 * 不随本文件增减而变，删掉这里的州也不会让图上的州界消失。
 * 与旧图的一处差别：野地并入行军图，可驻军、可作调动与进攻的目标（见《游戏机制》）。
 * 邻接由 tools/buildAdjacency.mjs 推导后手工粘入。运行：
 *   node tools/buildAdjacency.mjs geographySanguoNew GEOGRAPHY_SANGUO_NEW --fields
 */
export const GEOGRAPHY_SANGUO_NEW: Geography = {
  provinces: [
    { id: 'sili', name: '司隶', owner: 'caocao' },
    { id: 'yu', name: '豫州', owner: 'caocao' },
    { id: 'yan', name: '兖州', owner: 'caocao' },
    // 徐州：彭城是州治、与广陵皆归曹操，徐州由是归曹操。
    { id: 'xu', name: '徐州', owner: 'caocao' },
    // 青州：新图未立战略点，暂无人据。
    { id: 'qing', name: '青州', owner: null },
    // 凉州：南郑为张鲁所居、阳平关扼其西路，张鲁占两点；陇右的金城归马腾，天水、街亭、祁山、武都与定军山皆无归属，凉州仍归张鲁。
    { id: 'liang', name: '凉州', owner: 'zhanglu' },
    { id: 'bing', name: '并州', owner: null },
    { id: 'ji', name: '冀州', owner: 'caocao' },
    // 幽州：襄平、柳城与右北平归公孙康，蓟为州治、归曹操；公孙康占点最多，幽州归公孙康。
    { id: 'you', name: '幽州', owner: 'gongsunkang' },
    // 扬州：孙权据柴桑、建业、吴、会稽、东冶、京口与濡须，曹操据合肥、皖城与寿春，孙权占点最多，故扬州归孙权。
    { id: 'yang', name: '扬州', owner: 'sunquan' },
    // 荆州：荆南四郡属荆南，江陵、襄阳、樊城、宛城与夷陵属曹操，公安属刘备；曹操五点最多，荆州归曹操。
    { id: 'jing', name: '荆州', owner: 'caocao' },
    // 益州：刘璋据成都，外有雒城、绵竹、涪城与巴郡的江州、白帝城，北面葭萌关为汉中南入的关口；
    // 南中的三江城则属南蛮；刘璋占点最多，益州仍归刘璋。
    { id: 'yi', name: '益州', owner: 'liuzhang' },
    // 交州：番禺、广信、合浦、龙编与九真五郡归士燮，交州归士燮。
    { id: 'jiao', name: '交州', owner: 'shixie' },
  ],
  sites: [
    // 关中：槐里是马腾设在关中的大本营，长安、潼关与陈仓在东属曹操，两家在关中相望。
    // 槐里东接长安、西接陈仓；陈仓西出街亭入陇右，南下汉中经陈仓道，长安南经子午谷通南郑。
    { id: 'huaili', name: '槐里', type: 'town', population: 30000, provinceId: 'sili', owner: 'mateng', neighbors: ['changan', 'chencang'] },
    { id: 'chencang', name: '陈仓', type: 'town', population: 30000, provinceId: 'sili', owner: 'caocao', neighbors: ['huaili', 'jieting', 'yangpingguan'] },
    { id: 'changan', name: '长安', type: 'city', population: 80000, provinceId: 'sili', owner: 'caocao', neighbors: ['huaili', 'zhiwugu', 'tongguan'] },
    { id: 'tongguan', name: '潼关', type: 'pass', population: 20000, provinceId: 'sili', owner: 'caocao', neighbors: ['changan', 'luoyang'] },
    // 子午谷是长安与南郑之间的子午道，穿秦岭而过，眼下无归属。
    { id: 'zhiwugu', name: '子午谷', type: 'field', population: 0, provinceId: 'sili', owner: null, neighbors: ['changan', 'nanzheng'] },

    // 中原与河北：官渡战后曹操尽取之。洛阳据天下之中、虎牢关扼其东；陈留与许都分居兖、豫，
    // 许都为汉廷所在；邺是河北重镇，袁氏已亡，一并归曹操。洛阳—虎牢关—许都/陈留串起中原一线，
    // 邺则经陈留南下。宛城为南阳郡治，自洛阳、许都南下接襄阳与樊城，中原与荆州由此相通。
    { id: 'luoyang', name: '洛阳', type: 'town', population: 50000, provinceId: 'sili', owner: 'caocao', neighbors: ['hulao', 'wancheng', 'tongguan'] },
    { id: 'hulao', name: '虎牢关', type: 'pass', population: 20000, provinceId: 'sili', owner: 'caocao', neighbors: ['luoyang', 'xudu', 'chenliu'] },
    { id: 'chenliu', name: '陈留', type: 'city', population: 80000, provinceId: 'yan', owner: 'caocao', neighbors: ['xudu', 'hulao', 'ye'] },
    { id: 'xudu', name: '许都', type: 'metropolis', population: 120000, provinceId: 'yu', owner: 'caocao', neighbors: ['chenliu', 'hulao', 'wancheng', 'qiao'] },
    { id: 'ye', name: '邺', type: 'metropolis', population: 120000, provinceId: 'ji', owner: 'caocao', neighbors: ['chenliu', 'jicheng'] },
    // 谯即谯县，曹操本贯，在许都与寿春之间的涡水一线，是中原南下淮南的必经之地。
    { id: 'qiao', name: '谯', type: 'city', population: 80000, provinceId: 'yu', owner: 'caocao', neighbors: ['pengcheng', 'xudu', 'shouchun'] },

    // 辽东：襄平是辽东郡治，公孙康据之；柳城与右北平是襄平西出幽州的两处中转，皆归公孙康。
    // 柳城是辽西郡内的名城，当白狼山与柳城一战的地望，居襄平与右北平之间。
    // 蓟是幽州治所、归曹操，襄平西出柳城、右北平而抵蓟，再由蓟入邺。
    { id: 'xiangping', name: '襄平', type: 'city', population: 80000, provinceId: 'you', owner: 'gongsunkang', neighbors: ['liucheng'] },
    { id: 'liucheng', name: '柳城', type: 'town', population: 30000, provinceId: 'you', owner: 'gongsunkang', neighbors: ['youbeiping', 'xiangping'] },
    { id: 'youbeiping', name: '右北平', type: 'town', population: 30000, provinceId: 'you', owner: 'gongsunkang', neighbors: ['liucheng', 'jicheng'] },
    { id: 'jicheng', name: '蓟', type: 'city', population: 80000, provinceId: 'you', owner: 'caocao', neighbors: ['youbeiping', 'ye'] },

    { id: 'gongan', name: '公安', type: 'city', population: 80000, provinceId: 'jing', owner: 'liubei', neighbors: ['jiangling', 'wuling', 'yiling', 'chibi', 'changsha'] },
    { id: 'jiangling', name: '江陵', type: 'city', population: 80000, provinceId: 'jing', owner: 'caocao', neighbors: ['gongan', 'yiling', 'chibi', 'xiangyang'] },
    { id: 'xiangyang', name: '襄阳', type: 'metropolis', population: 120000, provinceId: 'jing', owner: 'caocao', neighbors: ['fancheng', 'yiling', 'jiangling'] },
    // 樊城在汉水北岸，与襄阳隔水相望，是曹操南面荆州的前哨。
    { id: 'fancheng', name: '樊城', type: 'city', population: 80000, provinceId: 'jing', owner: 'caocao', neighbors: ['xiangyang', 'wancheng'] },
    // 宛城为南阳郡治，是襄阳、樊城北上中原与关中的第一站，眼下属曹操。
    { id: 'wancheng', name: '宛城', type: 'city', population: 120000, provinceId: 'jing', owner: 'caocao', neighbors: ['fancheng', 'xudu', 'luoyang'] },
    // 夷陵是南郡属县，曹操自江陵分兵置此、曹洪守之，为荆州西面的前哨；与武陵之间不通，免得曹操由此插手荆南。
    { id: 'yiling', name: '夷陵', type: 'town', population: 30000, provinceId: 'jing', owner: 'caocao', neighbors: ['zigui', 'jiangling', 'gongan', 'xiangyang'] },
    // 秭归当巫峡之口，是夷陵与白帝城之间的一处县城；眼下无归属，刘备溯江入蜀必经于此。
    { id: 'zigui', name: '秭归', type: 'town', population: 30000, provinceId: 'jing', owner: null, neighbors: ['yiling', 'baidicheng'] },
    // 江夏（夏口）当汉水入江之口、在长江北岸，眼下无归属，东接柴桑、西临赤壁；皖城在庐江、中隔大别山，两地不直通。
    { id: 'jiangxia', name: '江夏', type: 'town', population: 80000, provinceId: 'jing', owner: null, neighbors: ['chibi', 'chaisang'] },
    // 赤壁：长江南岸的无主野地，荆扬之间的渡口，四家共临，江北的江夏又与之隔江相接。
    { id: 'chibi', name: '赤壁', type: 'field', population: 0, provinceId: 'jing', owner: null, neighbors: ['jiangxia', 'gongan', 'jiangling', 'chaisang', 'changsha'] },

    // 荆南四郡：四家太守各守其郡，同属「荆南」。
    { id: 'wuling', name: '武陵', type: 'city', population: 80000, provinceId: 'jing', owner: 'jingnan', neighbors: ['gongan', 'changsha', 'lingling'] },
    { id: 'changsha', name: '长沙', type: 'city', population: 80000, provinceId: 'jing', owner: 'jingnan', neighbors: ['wuling', 'gongan', 'chibi', 'lingling', 'guiyang'] },
    { id: 'lingling', name: '零陵', type: 'town', population: 80000, provinceId: 'jing', owner: 'jingnan', neighbors: ['guiyang', 'changsha', 'wuling'] },
    { id: 'guiyang', name: '桂阳', type: 'town', population: 80000, provinceId: 'jing', owner: 'jingnan', neighbors: ['lingling', 'changsha', 'panyu'] },

    // 扬州：孙权据柴桑，扼江东西口、与江夏相接；江东另有建业、吴与京口，江北有濡须。
    // 柴桑与建业同在长江南岸，水军顺流东下即入建业；建业北面由濡须口出入江北。
    { id: 'chaisang', name: '柴桑', type: 'city', population: 80000, provinceId: 'yang', owner: 'sunquan', neighbors: ['wanxian', 'jiangxia', 'chibi', 'jianye'] },
    // 皖城即皖县、庐江郡治，曹操据之；孙权攻皖、曹休南侵皆在此一带。
    { id: 'wanxian', name: '皖城', type: 'town', population: 80000, provinceId: 'yang', owner: 'caocao', neighbors: ['chaisang', 'hefei', 'ruxu'] },
    // 合肥与江东之间：濡须是孙权设在江北的关隘，曹操自合肥南下入江东必先夺此口，眼下为空关；建业为孙权所据。
    { id: 'hefei', name: '合肥', type: 'city', population: 80000, provinceId: 'yang', owner: 'caocao', neighbors: ['ruxu', 'shouchun', 'wanxian'] },
    { id: 'jingkou', name: '京口', type: 'city', population: 80000, provinceId: 'yang', owner: 'sunquan', neighbors: ['guangling', 'jianye', 'wu'] },
    { id: 'jianye', name: '建业', type: 'metropolis', population: 120000, provinceId: 'yang', owner: 'sunquan', neighbors: ['jingkou', 'ruxu', 'chaisang'] },
    // 吴即吴郡治吴县，孙氏本郡，在江东腹地、京口之东，眼下由孙权所据，南连会稽。
    { id: 'wu', name: '吴', type: 'city', population: 80000, provinceId: 'yang', owner: 'sunquan', neighbors: ['jingkou', 'kuaiji'] },
    // 会稽即会稽郡治山阴，在吴之南的江东腹地，归孙权；南出东冶，海路可达交州。
    { id: 'kuaiji', name: '会稽', type: 'city', population: 80000, provinceId: 'yang', owner: 'sunquan', neighbors: ['wu', 'dongye'] },
    // 东冶是会稽郡南部的海港、扬州最南端的一处县城，水军由此沿海南下入番禺，孙权与交州由是相接。
    { id: 'dongye', name: '东冶', type: 'town', population: 30000, provinceId: 'yang', owner: 'sunquan', neighbors: ['kuaiji', 'panyu'] },
    // 濡须是孙权设在江北的关隘，曹操自合肥南下入江东必先夺此口；对岸即建业，江东的水军由此出入。
    { id: 'ruxu', name: '濡须', type: 'pass', population: 20000, provinceId: 'yang', owner: 'sunquan', neighbors: ['hefei', 'jianye', 'wanxian'] },

    // 淮南：寿春是淮南的重镇、曹操所据，南接合肥、北接谯与彭城、东通广陵，谯再北通许都；广陵在寿春之东、隔江与京口相望，是江东出入江北的渡口。
    { id: 'shouchun', name: '寿春', type: 'city', population: 80000, provinceId: 'yang', owner: 'caocao', neighbors: ['hefei', 'pengcheng', 'qiao', 'guangling'] },
    { id: 'guangling', name: '广陵', type: 'town', population: 80000, provinceId: 'xu', owner: 'caocao', neighbors: ['jingkou', 'shouchun'] },
    // 彭城是徐州治所、曹操所据，北接沛国的谯、南连淮南的寿春，是中原东出徐州的门户。
    { id: 'pengcheng', name: '彭城', type: 'city', population: 80000, provinceId: 'xu', owner: 'caocao', neighbors: ['qiao', 'shouchun'] },

    // 陇右自西向东是 金城—天水—祁山 一线，天水东出街亭入关中；金城西出西平关。
    // 天水郡治冀县、眼下无归属；祁山、街亭与西平关亦无归属。
    { id: 'jincheng', name: '金城', type: 'city', population: 80000, provinceId: 'liang', owner: 'mateng', neighbors: ['xipingguan', 'tianshui'] },
    { id: 'tianshui', name: '天水', type: 'city', population: 80000, provinceId: 'liang', owner: null, neighbors: ['qishan', 'jieting', 'jincheng'] },
    // 祁山在天水之南、西汉水北岸，是陇右南下武都的一处隘口，眼下无归属。
    { id: 'qishan', name: '祁山', type: 'field', population: 0, provinceId: 'liang', owner: null, neighbors: ['wudu', 'tianshui'] },
    // 街亭当陇山道口，是陇右东出关中的唯一通路，天水与陈仓皆由此出入；眼下无归属，是一处无人戍守的野地。
    { id: 'jieting', name: '街亭', type: 'field', population: 0, provinceId: 'liang', owner: null, neighbors: ['tianshui', 'chencang'] },
    // 西平关在湟水谷地，是陇右西出河湟的门户，眼下无归属。
    { id: 'xipingguan', name: '西平关', type: 'pass', population: 20000, provinceId: 'liang', owner: null, neighbors: ['jincheng'] },

    // 陇南：武都郡治下辨，在祁山之南、今成县一带，是祁山道的枢纽，北接祁山、东接阳平关；眼下无归属。
    { id: 'wudu', name: '武都', type: 'city', population: 80000, provinceId: 'liang', owner: null, neighbors: ['qishan', 'yangpingguan'] },

    // 汉中：张鲁据南郑，阳平关扼其西路。汉中腹地另有定军山，当沔阳之南的要冲，眼下是无归属的野地；
    // 阳平关险不可拔，定军山却与南缘的葭萌关相通，是自南面绕开关隘、北上取汉中的一路。
    // 北面则自阳平关循陈仓道出散关、抵关中的陈仓，西面则循祁山道经武都入陇右，南郑北经子午谷抵长安；南郑不直通陈仓。
    { id: 'nanzheng', name: '南郑', type: 'city', population: 80000, provinceId: 'liang', owner: 'zhanglu', neighbors: ['dingjunshan', 'yangpingguan', 'zhiwugu'] },
    { id: 'yangpingguan', name: '阳平关', type: 'pass', population: 20000, provinceId: 'liang', owner: 'zhanglu', neighbors: ['jiamengguan', 'nanzheng', 'wudu', 'chencang'] },
    { id: 'dingjunshan', name: '定军山', type: 'field', population: 0, provinceId: 'liang', owner: null, neighbors: ['nanzheng', 'jiamengguan'] },

    // 益州：葭萌关是汉中南入益州的关口，南出即抵涪城，关下有涪城、绵竹、雒城、成都一线，成都为刘璋所居；
    // 绵竹当涪城与雒城之间的大道；巴郡另有江州与白帝城，江州居涪城之南、白帝城当三峡之口。
    { id: 'jiamengguan', name: '葭萌关', type: 'pass', population: 20000, provinceId: 'yi', owner: 'liuzhang', neighbors: ['yangpingguan', 'dingjunshan', 'fucheng'] },
    { id: 'fucheng', name: '涪城', type: 'city', population: 80000, provinceId: 'yi', owner: 'liuzhang', neighbors: ['mianzhu', 'luocheng', 'jiamengguan', 'jiangzhou'] },
    { id: 'mianzhu', name: '绵竹', type: 'town', population: 80000, provinceId: 'yi', owner: 'liuzhang', neighbors: ['luocheng', 'fucheng', 'chengdu'] },
    { id: 'luocheng', name: '雒城', type: 'town', population: 80000, provinceId: 'yi', owner: 'liuzhang', neighbors: ['chengdu', 'mianzhu', 'fucheng', 'jiangzhou'] },
    { id: 'chengdu', name: '成都', type: 'metropolis', population: 120000, provinceId: 'yi', owner: 'liuzhang', neighbors: ['luocheng', 'mianzhu', 'lushui'] },
    { id: 'jiangzhou', name: '江州', type: 'city', population: 80000, provinceId: 'yi', owner: 'liuzhang', neighbors: ['luocheng', 'fucheng', 'baidicheng'] },
    { id: 'baidicheng', name: '白帝城', type: 'town', population: 80000, provinceId: 'yi', owner: 'liuzhang', neighbors: ['zigui', 'jiangzhou'] },

    // 南中：南蛮自成一家的部族，以三江城为据、孟获为王；泸水是蜀军南渡金沙江处的无主野地，
    // 秃龙洞与三江城是南中的毒泉险地与屏障，桃花渡则是兀突骨屯藤甲兵的渡口，皆无归属。
    // 成都—泸水—秃龙洞—三江城—桃花渡串成一线，是自蜀中出入南中的一路，亦合《演义》南征的行军次序。
    { id: 'lushui', name: '泸水', type: 'field', population: 0, provinceId: 'yi', owner: null, neighbors: ['tulongdong', 'chengdu'] },
    { id: 'tulongdong', name: '秃龙洞', type: 'field', population: 0, provinceId: 'yi', owner: null, neighbors: ['sancheng', 'lushui'] },
    { id: 'sancheng', name: '三江城', type: 'city', population: 30000, provinceId: 'yi', owner: 'nanman', neighbors: ['tulongdong', 'taohuadu'] },
    { id: 'taohuadu', name: '桃花渡', type: 'field', population: 0, provinceId: 'yi', owner: null, neighbors: ['sancheng'] },

    // 交州：士燮一家据州自守，兄弟分守诸郡。番禺是南海郡治，西接苍梧的广信；广信为苍梧郡治，
    // 西下合浦；合浦南下龙编，九真在龙编之南，又沿海与合浦相通，五郡由此连成一线；
    // 番禺北接荆南的桂阳，交州与荆南相通；会稽在江东，南出东冶、海路亦通番禺。
    { id: 'panyu', name: '番禺', type: 'city', population: 80000, provinceId: 'jiao', owner: 'shixie', neighbors: ['guangxin', 'guiyang', 'dongye'] },
    { id: 'guangxin', name: '广信', type: 'city', population: 80000, provinceId: 'jiao', owner: 'shixie', neighbors: ['panyu', 'hepu'] },
    { id: 'hepu', name: '合浦', type: 'city', population: 80000, provinceId: 'jiao', owner: 'shixie', neighbors: ['guangxin', 'longbian', 'jiuzhen'] },
    { id: 'longbian', name: '龙编', type: 'city', population: 80000, provinceId: 'jiao', owner: 'shixie', neighbors: ['jiuzhen', 'hepu'] },
    { id: 'jiuzhen', name: '九真', type: 'town', population: 50000, provinceId: 'jiao', owner: 'shixie', neighbors: ['longbian', 'hepu'] },
  ],
}
