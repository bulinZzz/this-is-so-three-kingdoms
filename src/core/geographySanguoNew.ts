import type { Geography } from './model'

/**
 * 「建安十三年（新）」的地理数据，从头重做，正在逐点搭建。
 * 眼下是荆州一隅与扬州东端的柴桑：赤壁战后，刘备据公安，曹操守江陵、襄阳、樊城、宛与夷陵，孙权据柴桑，
 * 赤壁是无归属的野地，秭归是无归属的小城；荆南四郡（武陵、长沙、零陵、桂阳）自成一家的「荆南」势力所据——
 * 四郡名义上属曹操，但曹军隔着公安一线，刘备南下取四郡时北军顾及不及，
 * 故另立一家，与曹操无涉。赤壁当荆扬之间，江陵、公安、长沙、柴桑皆通于此，江北的江夏又与之隔江相接，四家共临；
 * 江夏（夏口）眼下无归属，是长江中游的一处无主据点，东接柴桑、西临赤壁。
 * 扬州另有合肥与京口：合肥属曹操，京口、建业与濡须口属孙权。濡须口是孙权设在江北的关隘、江东的北门户，
 * 曹操自合肥南下入江东必先夺此口，眼下是一处空关。淮南另有寿春与广陵，皆归曹操：寿春是淮南重镇，南接合肥、东通广陵，
 * 广陵隔江与京口相望、是江东出入江北的渡口；淮南与中原、庐江之间尚待徐、豫一带铺开后再接上邻接。关中另有槐里、长安、潼关三点：槐里在西属马腾，
 * 长安与潼关在东属曹操，两家在关中相望；马腾与陇右的韩遂合为一家，金城在其西、由韩遂驻守，西出湟水谷地的西平关。关中西出的第一站是陈仓，西上陇山经街亭、南下汉中经陈仓道，皆自此分途。陇右的天水、南安与安定是三处无主郡城，金城—南安—天水连成一线；街亭扼陇山道口，由是陇右门户，安定亦经此出入。天水之南另有祁山野地，南下接阳平关，是陇右入汉中的一路；汉中则北经陈仓道出散关、与关中相通。南下荆州则只经潼关—洛阳—宛一线，与扬州之间暂无通路。官渡之后袁氏已亡，河北与中原尽入曹操之手：
 * 洛阳据天下之中、虎牢关扼其东，陈留与许都分居兖、豫而许都为汉廷所在，邺是河北重镇——洛阳—虎牢关—许都/陈留
 * 串成中原一线，邺则经陈留南下；宛为南阳郡治，自洛阳、许都南下接樊城与襄阳，中原由是与荆州相通。汉中另有张鲁一家：
 * 南郑为其所居，东境的上庸当汉水上游、东经秭归入巴东，是汉中东出荆州的一路，南郑东出上庸须循汉水干流、其间并无直道（汉水是无归属的野地），阳平关扼其西路，是汉中腹地与西面门户；阳平关险不可拔，沔阳之南的定军山却是无归属的野地，
 * 与南缘的葭萌关相通，是自南面绕开关隘、北上取汉中的一路。益州另有刘璋一家：成都为其所居，
 * 北面隔着雒城、绵竹与涪城三座大城，绵竹当涪城与雒城之间的大道，葭萌关则是汉中南入益州的关口，
 * 归刘璋——两家在关前相望。巴郡另有江州与白帝城，皆归刘璋：江州居涪城之南，
 * 白帝城当三峡之口，隔江与夷陵相望，其间又有秭归为县城、眼下无归属，是荆州溯江入益州的门户——涪城—江州—白帝城—秭归—夷陵连成一线，
 * 益州由是与荆州相通，汉中则经葭萌关入益州、再接上此线。南中自成一家的「南蛮」以三江城为据、孟获为王；
 * 泸水是蜀军南渡金沙江处的无主野地，秃龙洞与三江城是南中的毒泉险地与屏障，桃花渡则是兀突骨屯藤甲兵的渡口，皆无归属。
 * 成都—泸水—秃龙洞—三江城—桃花渡串成一线，是自蜀中出入南中的一路，亦合《演义》南征的行军次序。
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
    // 徐州：眼下只入了广陵一点，归曹操，故徐州暂归曹操。
    { id: 'xu', name: '徐州', owner: 'caocao' },
    { id: 'qing', name: '青州', owner: null },
    // 凉州：南郑为张鲁所居、阳平关扼其西路，张鲁占两点；陇右的金城归马腾，只此一点，凉州仍归张鲁。
    { id: 'liang', name: '凉州', owner: 'zhanglu' },
    { id: 'bing', name: '并州', owner: null },
    { id: 'ji', name: '冀州', owner: 'caocao' },
    { id: 'you', name: '幽州', owner: null },
    // 扬州：孙权据柴桑、建业、京口与濡须口，曹操据合肥与寿春，孙权占点最多，故扬州归孙权。
    { id: 'yang', name: '扬州', owner: 'sunquan' },
    // 荆州：荆南四郡属荆南，江陵、襄阳、樊城、宛与夷陵属曹操，公安属刘备；曹操五点最多，荆州归曹操。
    { id: 'jing', name: '荆州', owner: 'caocao' },
    // 益州：刘璋据成都，外有雒城、绵竹、涪城与巴郡的江州、白帝城，北面葭萌关为汉中南入的关口；
    // 汉中东境的上庸亦在益州界内、随汉中归张鲁，南中的三江城则属南蛮；刘璋占点最多，益州仍归刘璋。
    { id: 'yi', name: '益州', owner: 'liuzhang' },
    { id: 'jiao', name: '交州', owner: null },
  ],
  sites: [
    // 关中：槐里在西属马腾，长安与潼关在东属曹操，两家在关中相望；陈仓是关中西出的第一站，
    // 西上陇山经街亭、南下汉中经陈仓道，皆自陈仓分途。
    { id: 'huaili', name: '槐里', type: 'town', population: 30000, provinceId: 'sili', owner: 'mateng', neighbors: ['changan', 'chencang'] },
    { id: 'chencang', name: '陈仓', type: 'town', population: 30000, provinceId: 'sili', owner: 'caocao', neighbors: ['huaili', 'anding', 'jieting', 'yangpingguan'] },
    { id: 'changan', name: '长安', type: 'city', population: 80000, provinceId: 'sili', owner: 'caocao', neighbors: ['huaili', 'tongguan'] },
    { id: 'tongguan', name: '潼关', type: 'pass', population: 20000, provinceId: 'sili', owner: 'caocao', neighbors: ['changan', 'luoyang'] },

    // 中原与河北：官渡战后曹操尽取之。洛阳据天下之中、虎牢关扼其东；陈留与许都分居兖、豫，
    // 许都为汉廷所在；邺是河北重镇，袁氏已亡，一并归曹操。洛阳—虎牢关—许都/陈留串起中原一线，
    // 邺则经陈留南下。宛为南阳郡治，自洛阳、许都南下接襄阳与樊城，中原与荆州由此相通。
    { id: 'luoyang', name: '洛阳', type: 'town', population: 50000, provinceId: 'sili', owner: 'caocao', neighbors: ['hulao', 'wancheng', 'tongguan'] },
    { id: 'hulao', name: '虎牢关', type: 'pass', population: 20000, provinceId: 'sili', owner: 'caocao', neighbors: ['luoyang', 'xudu', 'chenliu'] },
    { id: 'chenliu', name: '陈留', type: 'city', population: 80000, provinceId: 'yan', owner: 'caocao', neighbors: ['xudu', 'hulao', 'ye'] },
    { id: 'xudu', name: '许都', type: 'metropolis', population: 120000, provinceId: 'yu', owner: 'caocao', neighbors: ['chenliu', 'hulao', 'wancheng'] },
    { id: 'ye', name: '邺', type: 'metropolis', population: 120000, provinceId: 'ji', owner: 'caocao', neighbors: ['chenliu'] },

    { id: 'gongan', name: '公安', type: 'city', population: 80000, provinceId: 'jing', owner: 'liubei', neighbors: ['jiangling', 'wuling', 'yiling', 'chibi', 'changsha'] },
    { id: 'jiangling', name: '江陵', type: 'city', population: 80000, provinceId: 'jing', owner: 'caocao', neighbors: ['gongan', 'yiling', 'chibi', 'xiangyang'] },
    { id: 'xiangyang', name: '襄阳', type: 'metropolis', population: 120000, provinceId: 'jing', owner: 'caocao', neighbors: ['fancheng', 'yiling', 'jiangling'] },
    // 樊城在汉水北岸，与襄阳隔水相望，是曹操南面荆州的前哨。
    { id: 'fancheng', name: '樊城', type: 'city', population: 80000, provinceId: 'jing', owner: 'caocao', neighbors: ['xiangyang', 'wancheng'] },
    // 宛为南阳郡治，是襄阳、樊城北上中原与关中的第一站，眼下属曹操。
    { id: 'wancheng', name: '宛', type: 'metropolis', population: 120000, provinceId: 'jing', owner: 'caocao', neighbors: ['fancheng', 'xudu', 'luoyang'] },
    // 夷陵是南郡属县，曹操自江陵分兵置此、曹洪守之，为荆州西面的前哨；与武陵之间不通，免得曹操由此插手荆南。
    { id: 'yiling', name: '夷陵', type: 'town', population: 30000, provinceId: 'jing', owner: 'caocao', neighbors: ['zigui', 'jiangling', 'gongan', 'xiangyang'] },
    // 秭归当巫峡之口，是夷陵与白帝城之间的一处县城，又西通汉中东段的上庸；眼下无归属，刘备溯江入蜀必经于此。
    { id: 'zigui', name: '秭归', type: 'town', population: 30000, provinceId: 'jing', owner: null, neighbors: ['yiling', 'baidicheng', 'shangyong'] },
    // 江夏（夏口）当汉水入江之口、在长江北岸，眼下无归属，东连柴桑、西临赤壁。
    { id: 'jiangxia', name: '江夏', type: 'city', population: 80000, provinceId: 'jing', owner: null, neighbors: ['chibi', 'chaisang'] },
    // 赤壁：长江南岸的无主野地，荆扬之间的渡口，四家共临，江北的江夏又与之隔江相接。
    { id: 'chibi', name: '赤壁', type: 'field', population: 0, provinceId: 'jing', owner: null, neighbors: ['jiangxia', 'gongan', 'jiangling', 'chaisang', 'changsha'] },

    // 荆南四郡：四家太守各守其郡，同属「荆南」。
    { id: 'wuling', name: '武陵', type: 'city', population: 80000, provinceId: 'jing', owner: 'jingnan', neighbors: ['gongan', 'changsha', 'lingling'] },
    { id: 'changsha', name: '长沙', type: 'city', population: 80000, provinceId: 'jing', owner: 'jingnan', neighbors: ['wuling', 'gongan', 'chibi', 'lingling', 'guiyang'] },
    { id: 'lingling', name: '零陵', type: 'city', population: 80000, provinceId: 'jing', owner: 'jingnan', neighbors: ['guiyang', 'changsha', 'wuling'] },
    { id: 'guiyang', name: '桂阳', type: 'city', population: 80000, provinceId: 'jing', owner: 'jingnan', neighbors: ['lingling', 'changsha'] },

    // 扬州：孙权据柴桑，扼江东西口、与江夏相接；江东另有建业、京口，江北有濡须口。
    { id: 'chaisang', name: '柴桑', type: 'city', population: 80000, provinceId: 'yang', owner: 'sunquan', neighbors: ['jiangxia', 'chibi'] },
    // 合肥与江东之间：濡须口是孙权设在江北的关隘，曹操自合肥南下入江东必先夺此口，眼下为空关；建业为孙权所据。
    { id: 'hefei', name: '合肥', type: 'city', population: 80000, provinceId: 'yang', owner: 'caocao', neighbors: ['ruxukou', 'shouchun'] },
    { id: 'jingkou', name: '京口', type: 'city', population: 80000, provinceId: 'yang', owner: 'sunquan', neighbors: ['guangling', 'jianye'] },
    { id: 'jianye', name: '建业', type: 'metropolis', population: 120000, provinceId: 'yang', owner: 'sunquan', neighbors: ['jingkou', 'ruxukou'] },
    { id: 'ruxukou', name: '濡须口', type: 'pass', population: 20000, provinceId: 'yang', owner: 'sunquan', neighbors: ['hefei', 'jianye'] },

    // 淮南：寿春是淮南的重镇、曹操所据，南接合肥、东通广陵；广陵在寿春之东、隔江与京口相望，是江东出入江北的渡口。
    { id: 'shouchun', name: '寿春', type: 'city', population: 80000, provinceId: 'yang', owner: 'caocao', neighbors: ['hefei', 'guangling'] },
    { id: 'guangling', name: '广陵', type: 'city', population: 80000, provinceId: 'xu', owner: 'caocao', neighbors: ['jingkou', 'shouchun'] },

    // 陇右自西向东是 金城—南安—天水 一线，天水东出关中须经街亭，街亭东接陈仓；金城西出西平关。
    // 天水、南安与安定是陇右与陇东的三处郡城，眼下无归属；安定在东北，经陈仓与街亭两路接道口。
    { id: 'jincheng', name: '金城', type: 'city', population: 80000, provinceId: 'liang', owner: 'mateng', neighbors: ['nanan', 'xipingguan'] },
    { id: 'tianshui', name: '天水', type: 'city', population: 80000, provinceId: 'liang', owner: null, neighbors: ['qishan', 'jieting', 'nanan'] },
    { id: 'nanan', name: '南安', type: 'city', population: 80000, provinceId: 'liang', owner: null, neighbors: ['tianshui', 'jincheng'] },
    { id: 'anding', name: '安定', type: 'city', population: 80000, provinceId: 'liang', owner: null, neighbors: ['chencang', 'jieting'] },
    // 祁山在天水之南、西汉水北岸，是陇右南下汉中的一处隘口，眼下无归属。
    { id: 'qishan', name: '祁山', type: 'field', population: 0, provinceId: 'liang', owner: null, neighbors: ['tianshui', 'yangpingguan'] },
    // 街亭当陇山道口，是关中入陇右的唯一通路，天水与安定皆由此出入，眼下无归属。
    { id: 'jieting', name: '街亭', type: 'pass', population: 20000, provinceId: 'liang', owner: null, neighbors: ['tianshui', 'anding', 'chencang'] },
    // 西平关在湟水谷地，是陇右西出河湟的门户，眼下无归属。
    { id: 'xipingguan', name: '西平关', type: 'pass', population: 20000, provinceId: 'liang', owner: null, neighbors: ['jincheng'] },

    // 汉中：张鲁据南郑，阳平关扼其西路。汉中腹地另有定军山，当沔阳之南的要冲，眼下是无归属的野地；
    // 阳平关险不可拔，定军山却与南缘的葭萌关相通，是自南面绕开关隘、北上取汉中的一路。
    // 北面则自阳平关循陈仓道出散关、抵关中的陈仓，是诸葛亮北伐与曹操取汉中的一路；南郑不直通陈仓。
    // 汉水是汉中盆地东段的一段无主野地（城固、洋县一带，落在益州界内，与上庸同）：南郑东出上庸须循此水路，两城之间没有直道。
    { id: 'nanzheng', name: '南郑', type: 'city', population: 80000, provinceId: 'liang', owner: 'zhanglu', neighbors: ['dingjunshan', 'yangpingguan', 'hanshui'] },
    { id: 'yangpingguan', name: '阳平关', type: 'pass', population: 20000, provinceId: 'liang', owner: 'zhanglu', neighbors: ['jiamengguan', 'nanzheng', 'qishan', 'chencang'] },
    { id: 'dingjunshan', name: '定军山', type: 'field', population: 0, provinceId: 'liang', owner: null, neighbors: ['nanzheng', 'jiamengguan'] },
    { id: 'hanshui', name: '汉水', type: 'field', population: 0, provinceId: 'yi', owner: null, neighbors: ['nanzheng', 'shangyong'] },

    // 益州：葭萌关是汉中南入益州的关口，关下有涪城、绵竹、雒城、成都一线，成都为刘璋所居；
    // 绵竹当涪城与雒城之间的大道，巴郡另有江州与白帝城，江州居涪城之南、白帝城当三峡之口。
    { id: 'jiamengguan', name: '葭萌关', type: 'pass', population: 20000, provinceId: 'yi', owner: 'liuzhang', neighbors: ['yangpingguan', 'dingjunshan', 'fucheng'] },
    { id: 'fucheng', name: '涪城', type: 'city', population: 80000, provinceId: 'yi', owner: 'liuzhang', neighbors: ['mianzhu', 'luocheng', 'jiamengguan', 'jiangzhou'] },
    { id: 'mianzhu', name: '绵竹', type: 'city', population: 80000, provinceId: 'yi', owner: 'liuzhang', neighbors: ['luocheng', 'fucheng', 'chengdu'] },
    { id: 'luocheng', name: '雒城', type: 'city', population: 80000, provinceId: 'yi', owner: 'liuzhang', neighbors: ['chengdu', 'mianzhu', 'fucheng', 'jiangzhou'] },
    { id: 'chengdu', name: '成都', type: 'metropolis', population: 120000, provinceId: 'yi', owner: 'liuzhang', neighbors: ['luocheng', 'mianzhu', 'lushui'] },
    { id: 'jiangzhou', name: '江州', type: 'city', population: 80000, provinceId: 'yi', owner: 'liuzhang', neighbors: ['luocheng', 'fucheng', 'baidicheng'] },
    { id: 'baidicheng', name: '白帝城', type: 'city', population: 80000, provinceId: 'yi', owner: 'liuzhang', neighbors: ['zigui', 'jiangzhou'] },
    // 上庸是汉中郡东三县之一，随汉中归张鲁；当汉水上游，西循汉水通南郑、东经秭归入巴东，是汉中东出荆州的一路。
    { id: 'shangyong', name: '上庸', type: 'town', population: 30000, provinceId: 'yi', owner: 'zhanglu', neighbors: ['zigui', 'hanshui'] },

    // 南中：南蛮自成一家的部族，以三江城为据、孟获为王；泸水是蜀军南渡金沙江处的无主野地，
    // 秃龙洞与三江城是南中的毒泉险地与屏障，桃花渡则是兀突骨屯藤甲兵的渡口，皆无归属。
    // 成都—泸水—秃龙洞—三江城—桃花渡串成一线，是自蜀中出入南中的一路，亦合《演义》南征的行军次序。
    { id: 'lushui', name: '泸水', type: 'field', population: 0, provinceId: 'yi', owner: null, neighbors: ['tulongdong', 'chengdu'] },
    { id: 'tulongdong', name: '秃龙洞', type: 'field', population: 0, provinceId: 'yi', owner: null, neighbors: ['sancheng', 'lushui'] },
    { id: 'sancheng', name: '三江城', type: 'town', population: 30000, provinceId: 'yi', owner: 'nanman', neighbors: ['tulongdong', 'taohuadu'] },
    { id: 'taohuadu', name: '桃花渡', type: 'field', population: 0, provinceId: 'yi', owner: null, neighbors: ['sancheng'] },
  ],
}
