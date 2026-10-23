import type { Geography } from './model'

/**
 * 「建安十三年（新）」的地理数据，从头重做，正在逐点搭建。
 * 眼下是荆州一隅与扬州东端的柴桑：赤壁战后，刘备据公安，曹操守江陵、襄阳、樊城、宛与夷陵，孙权据柴桑，
 * 赤壁是无归属的野地，秭归是无归属的小城；荆南四郡（武陵、长沙、零陵、桂阳）自成一家的「荆南」势力所据——
 * 四郡名义上属曹操，但曹军隔着公安一线，刘备南下取四郡时北军顾及不及，
 * 故另立一家，与曹操无涉。赤壁当荆扬之间，江陵、公安、长沙、柴桑皆通于此，江北的江夏又与之隔江相接，四家共临；
 * 江夏（夏口）眼下无归属，是长江中游的一处无主据点，西临赤壁、东接武昌；武昌本是鄂县、在长江南岸的夏口下游，
 * 孙权据之，江夏—武昌—柴桑由是连成一线，江东的势力伸进荆州。
 * 扬州另有合肥与京口：合肥属曹操，京口、建业与濡须属孙权。濡须是孙权设在江北的关隘、江东的北门户，
 * 曹操自合肥南下入江东必先夺此口，眼下是一处空关；建业在江东，与京口相接，
 * 柴桑又同在长江南岸，水军顺流东下，经牛渚再入建业。
 * 庐江郡的皖城归曹操，与合肥、濡须、武昌皆直连。淮南另有寿春与广陵，皆归曹操：寿春是淮南重镇，南接合肥、北通许都、东通广陵，
 * 广陵隔江与京口相望、是江东出入江北的渡口。关中另有槐里、陈仓、五丈原、长安与潼关五点：
 * 槐里在西属马腾，长安、潼关与陈仓在东属曹操，两家在关中相望；五丈原是渭水南岸的无主野地，在陈仓与槐里之间，也是褒斜道北出秦岭的落脚处。
 * 马腾与陇右的韩遂合为一家，金城在其西、由韩遂驻守，西出湟水谷地的西平关。
 * 陇右自西向东是 金城—上邽—祁山 一线，上邽北出街亭、东入关中，街亭由是陇右门户；上邽是无主的郡城，祁山是南下武都的野地。
 * 陇右之南另有武都、阴平两郡，皆无归属：武都郡治下辨，当祁山道的枢纽，北接祁山、东接阳平关；阴平更在其南，沿阴平道入涪城、循景谷道抵葭萌关。
 * 关中出入有三路：西出经街亭，西南经陈仓道入汉中，南经子午道抵南郑；汉中的南郑又循褒斜道北出五丈原。南下荆州则只经潼关—洛阳—宛一线，与扬州之间暂无通路。官渡之后袁氏已亡，河北与中原尽入曹操之手：
 * 洛阳据天下之中、虎牢关扼其东，陈留与许都分居兖、豫而许都为汉廷所在，邺是河北重镇——洛阳—虎牢关—许都/陈留
 * 串成中原一线，邺则经陈留南下；宛为南阳郡治，自洛阳、许都南下接樊城与襄阳，中原由是与荆州相通。
 * 幽州东端的辽东另有公孙康一家，据襄平自守；辽西的柳城、蓟等点尚未入图，襄平暂以长直连与邺、广陵相通，待辽西诸点入图后再改。汉中另有张鲁一家：
 * 南郑为其所居，阳平关扼其西路，是汉中腹地与西面门户；南郑又北经子午谷直抵长安、循褒斜道出五丈原，东出荆州则须借道巴东。
 * 阳平关险不可拔，沔阳之南的定军山却是无归属的野地，
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
    // 凉州：南郑为张鲁所居、阳平关扼其西路，张鲁占两点；陇右的金城归马腾，上邽、街亭、祁山、武都、阴平与定军山皆无归属，凉州仍归张鲁。
    { id: 'liang', name: '凉州', owner: 'zhanglu' },
    { id: 'bing', name: '并州', owner: null },
    { id: 'ji', name: '冀州', owner: 'caocao' },
    // 幽州：眼下只入了辽东的襄平，归公孙康，故幽州归公孙康。
    { id: 'you', name: '幽州', owner: 'gongsunkang' },
    // 扬州：孙权据柴桑、建业、京口与濡须，曹操据合肥、皖城与寿春，孙权占点最多，故扬州归孙权。
    { id: 'yang', name: '扬州', owner: 'sunquan' },
    // 荆州：荆南四郡属荆南，江陵、襄阳、樊城、宛与夷陵属曹操，公安属刘备；曹操五点最多，荆州归曹操。
    { id: 'jing', name: '荆州', owner: 'caocao' },
    // 益州：刘璋据成都，外有雒城、绵竹、涪城与巴郡的江州、白帝城，北面葭萌关为汉中南入的关口；
    // 南中的三江城则属南蛮；刘璋占点最多，益州仍归刘璋。
    { id: 'yi', name: '益州', owner: 'liuzhang' },
    { id: 'jiao', name: '交州', owner: null },
  ],
  sites: [
    // 关中：槐里在西属马腾，长安、潼关与陈仓在东属曹操，两家在关中相望。
    // 槐里西出街亭入陇右，陈仓南下汉中经陈仓道，长安南经子午谷通南郑，南郑北上循褒斜道抵五丈原。
    { id: 'huaili', name: '槐里', type: 'town', population: 30000, provinceId: 'sili', owner: 'mateng', neighbors: ['wuzhangyuan', 'changan', 'jieting'] },
    { id: 'chencang', name: '陈仓', type: 'town', population: 30000, provinceId: 'sili', owner: 'caocao', neighbors: ['wuzhangyuan', 'yangpingguan'] },
    // 五丈原是渭水南岸的高地，在陈仓与槐里之间，褒斜道自南郑北出即落于此；眼下无归属。
    { id: 'wuzhangyuan', name: '五丈原', type: 'field', population: 0, provinceId: 'sili', owner: null, neighbors: ['chencang', 'huaili', 'nanzheng'] },
    { id: 'changan', name: '长安', type: 'city', population: 80000, provinceId: 'sili', owner: 'caocao', neighbors: ['huaili', 'zhiwugu', 'tongguan'] },
    { id: 'tongguan', name: '潼关', type: 'pass', population: 20000, provinceId: 'sili', owner: 'caocao', neighbors: ['changan', 'luoyang'] },
    // 子午谷是长安与南郑之间的子午道，穿秦岭而过，眼下无归属。
    { id: 'zhiwugu', name: '子午谷', type: 'field', population: 0, provinceId: 'sili', owner: null, neighbors: ['changan', 'nanzheng'] },

    // 中原与河北：官渡战后曹操尽取之。洛阳据天下之中、虎牢关扼其东；陈留与许都分居兖、豫，
    // 许都为汉廷所在；邺是河北重镇，袁氏已亡，一并归曹操。洛阳—虎牢关—许都/陈留串起中原一线，
    // 邺则经陈留南下。宛为南阳郡治，自洛阳、许都南下接襄阳与樊城，中原与荆州由此相通。
    { id: 'luoyang', name: '洛阳', type: 'town', population: 50000, provinceId: 'sili', owner: 'caocao', neighbors: ['hulao', 'wancheng', 'tongguan'] },
    { id: 'hulao', name: '虎牢关', type: 'pass', population: 20000, provinceId: 'sili', owner: 'caocao', neighbors: ['luoyang', 'xudu', 'chenliu'] },
    { id: 'chenliu', name: '陈留', type: 'city', population: 80000, provinceId: 'yan', owner: 'caocao', neighbors: ['xudu', 'hulao', 'ye'] },
    { id: 'xudu', name: '许都', type: 'metropolis', population: 120000, provinceId: 'yu', owner: 'caocao', neighbors: ['chenliu', 'hulao', 'wancheng', 'shouchun'] },
    { id: 'ye', name: '邺', type: 'metropolis', population: 120000, provinceId: 'ji', owner: 'caocao', neighbors: ['chenliu', 'xiangping'] },

    // 辽东：襄平是辽东郡治，公孙康据之；辽西诸点尚未入图，暂与邺、广陵直连。
    { id: 'xiangping', name: '襄平', type: 'city', population: 80000, provinceId: 'you', owner: 'gongsunkang', neighbors: ['ye', 'guangling'] },

    { id: 'gongan', name: '公安', type: 'city', population: 80000, provinceId: 'jing', owner: 'liubei', neighbors: ['jiangling', 'wuling', 'yiling', 'chibi', 'changsha'] },
    { id: 'jiangling', name: '江陵', type: 'city', population: 80000, provinceId: 'jing', owner: 'caocao', neighbors: ['gongan', 'yiling', 'chibi', 'xiangyang'] },
    { id: 'xiangyang', name: '襄阳', type: 'metropolis', population: 120000, provinceId: 'jing', owner: 'caocao', neighbors: ['fancheng', 'yiling', 'jiangling'] },
    // 樊城在汉水北岸，与襄阳隔水相望，是曹操南面荆州的前哨。
    { id: 'fancheng', name: '樊城', type: 'city', population: 80000, provinceId: 'jing', owner: 'caocao', neighbors: ['xiangyang', 'wancheng'] },
    // 宛为南阳郡治，是襄阳、樊城北上中原与关中的第一站，眼下属曹操。
    { id: 'wancheng', name: '宛', type: 'metropolis', population: 120000, provinceId: 'jing', owner: 'caocao', neighbors: ['fancheng', 'xudu', 'luoyang'] },
    // 夷陵是南郡属县，曹操自江陵分兵置此、曹洪守之，为荆州西面的前哨；与武陵之间不通，免得曹操由此插手荆南。
    { id: 'yiling', name: '夷陵', type: 'town', population: 30000, provinceId: 'jing', owner: 'caocao', neighbors: ['zigui', 'jiangling', 'gongan', 'xiangyang'] },
    // 秭归当巫峡之口，是夷陵与白帝城之间的一处县城；眼下无归属，刘备溯江入蜀必经于此。
    { id: 'zigui', name: '秭归', type: 'town', population: 30000, provinceId: 'jing', owner: null, neighbors: ['yiling', 'baidicheng'] },
    // 江夏（夏口）当汉水入江之口、在长江北岸，眼下无归属，东连武昌、西临赤壁。
    { id: 'jiangxia', name: '江夏', type: 'city', population: 80000, provinceId: 'jing', owner: null, neighbors: ['wuchang', 'chibi'] },
    // 武昌本是鄂县，在长江南岸、夏口下游，孙权据之，是江东伸向荆州的一处江防城池。
    { id: 'wuchang', name: '武昌', type: 'city', population: 80000, provinceId: 'jing', owner: 'sunquan', neighbors: ['jiangxia', 'chaisang', 'wanxian'] },
    // 赤壁：长江南岸的无主野地，荆扬之间的渡口，四家共临，江北的江夏又与之隔江相接。
    { id: 'chibi', name: '赤壁', type: 'field', population: 0, provinceId: 'jing', owner: null, neighbors: ['jiangxia', 'gongan', 'jiangling', 'chaisang', 'changsha'] },

    // 荆南四郡：四家太守各守其郡，同属「荆南」。
    { id: 'wuling', name: '武陵', type: 'city', population: 80000, provinceId: 'jing', owner: 'jingnan', neighbors: ['gongan', 'changsha', 'lingling'] },
    { id: 'changsha', name: '长沙', type: 'city', population: 80000, provinceId: 'jing', owner: 'jingnan', neighbors: ['wuling', 'gongan', 'chibi', 'lingling', 'guiyang'] },
    { id: 'lingling', name: '零陵', type: 'city', population: 80000, provinceId: 'jing', owner: 'jingnan', neighbors: ['guiyang', 'changsha', 'wuling'] },
    { id: 'guiyang', name: '桂阳', type: 'city', population: 80000, provinceId: 'jing', owner: 'jingnan', neighbors: ['lingling', 'changsha'] },

    // 扬州：孙权据柴桑，扼江东西口、与武昌相接；江东另有建业、京口，江北有濡须。
    // 柴桑与建业同在长江南岸，水军顺流经牛渚而至。
    { id: 'chaisang', name: '柴桑', type: 'city', population: 80000, provinceId: 'yang', owner: 'sunquan', neighbors: ['wanxian', 'wuchang', 'chibi', 'niuzhu'] },
    // 皖城即皖县、庐江郡治，曹操据之；孙权攻皖、曹休南侵皆在此一带。
    { id: 'wanxian', name: '皖城', type: 'city', population: 80000, provinceId: 'yang', owner: 'caocao', neighbors: ['chaisang', 'hefei', 'wuchang', 'ruxu'] },
    // 合肥与江东之间：濡须是孙权设在江北的关隘，曹操自合肥南下入江东必先夺此口，眼下为空关；建业为孙权所据。
    { id: 'hefei', name: '合肥', type: 'city', population: 80000, provinceId: 'yang', owner: 'caocao', neighbors: ['ruxu', 'shouchun', 'wanxian'] },
    { id: 'jingkou', name: '京口', type: 'city', population: 80000, provinceId: 'yang', owner: 'sunquan', neighbors: ['guangling', 'jianye'] },
    { id: 'jianye', name: '建业', type: 'metropolis', population: 120000, provinceId: 'yang', owner: 'sunquan', neighbors: ['niuzhu', 'jingkou'] },
    { id: 'ruxu', name: '濡须', type: 'pass', population: 20000, provinceId: 'yang', owner: 'sunquan', neighbors: ['niuzhu', 'hefei', 'wanxian'] },
    // 牛渚是长江南岸的渡口，采石矶当建业上游，孙权遣将屯守；柴桑顺流至此，再下即抵建业。
    { id: 'niuzhu', name: '牛渚', type: 'pass', population: 20000, provinceId: 'yang', owner: 'sunquan', neighbors: ['jianye', 'ruxu', 'chaisang'] },

    // 淮南：寿春是淮南的重镇、曹操所据，南接合肥、北通许都、东通广陵；广陵在寿春之东、隔江与京口相望，是江东出入江北的渡口。
    { id: 'shouchun', name: '寿春', type: 'city', population: 80000, provinceId: 'yang', owner: 'caocao', neighbors: ['hefei', 'guangling', 'xudu'] },
    { id: 'guangling', name: '广陵', type: 'city', population: 80000, provinceId: 'xu', owner: 'caocao', neighbors: ['jingkou', 'shouchun', 'xiangping'] },

    // 陇右自西向东是 金城—上邽—祁山 一线，上邽北出街亭入关中；金城西出西平关。
    // 上邽是天水郡治、眼下无归属；祁山、街亭与西平关亦无归属。
    { id: 'jincheng', name: '金城', type: 'city', population: 80000, provinceId: 'liang', owner: 'mateng', neighbors: ['xipingguan', 'shanggui'] },
    { id: 'shanggui', name: '上邽', type: 'city', population: 80000, provinceId: 'liang', owner: null, neighbors: ['jieting', 'qishan', 'jincheng'] },
    // 祁山在上邽之南、西汉水北岸，是陇右南下武都的一处隘口，眼下无归属。
    { id: 'qishan', name: '祁山', type: 'field', population: 0, provinceId: 'liang', owner: null, neighbors: ['wudu', 'shanggui'] },
    // 街亭当陇山道口，是关中入陇右的唯一通路，上邽与槐里皆由此出入，眼下无归属。
    { id: 'jieting', name: '街亭', type: 'pass', population: 20000, provinceId: 'liang', owner: null, neighbors: ['shanggui', 'huaili'] },
    // 西平关在湟水谷地，是陇右西出河湟的门户，眼下无归属。
    { id: 'xipingguan', name: '西平关', type: 'pass', population: 20000, provinceId: 'liang', owner: null, neighbors: ['jincheng'] },

    // 陇南：武都郡治下辨，在祁山之南、今成县一带，是祁山道的枢纽；阴平更在其南、今文县一带，
    // 北接武都，南下经阴平道入涪城、东出景谷道抵葭萌关。两郡眼下皆无归属。
    { id: 'wudu', name: '武都', type: 'city', population: 80000, provinceId: 'liang', owner: null, neighbors: ['qishan', 'yangpingguan', 'yinping'] },
    { id: 'yinping', name: '阴平', type: 'town', population: 30000, provinceId: 'liang', owner: null, neighbors: ['wudu', 'jiamengguan', 'fucheng'] },

    // 汉中：张鲁据南郑，阳平关扼其西路。汉中腹地另有定军山，当沔阳之南的要冲，眼下是无归属的野地；
    // 阳平关险不可拔，定军山却与南缘的葭萌关相通，是自南面绕开关隘、北上取汉中的一路。
    // 北面则自阳平关循陈仓道出散关、抵关中的陈仓，西面则循祁山道经武都入陇右，东面则南郑北经子午谷抵长安、循褒斜道出五丈原；南郑不直通陈仓。
    { id: 'nanzheng', name: '南郑', type: 'city', population: 80000, provinceId: 'liang', owner: 'zhanglu', neighbors: ['dingjunshan', 'yangpingguan', 'zhiwugu', 'wuzhangyuan'] },
    { id: 'yangpingguan', name: '阳平关', type: 'pass', population: 20000, provinceId: 'liang', owner: 'zhanglu', neighbors: ['jiamengguan', 'nanzheng', 'wudu', 'chencang'] },
    { id: 'dingjunshan', name: '定军山', type: 'field', population: 0, provinceId: 'liang', owner: null, neighbors: ['nanzheng', 'jiamengguan'] },

    // 益州：葭萌关是汉中南入益州的关口，关下有涪城、绵竹、雒城、成都一线，成都为刘璋所居；
    // 绵竹当涪城与雒城之间的大道，巴郡另有江州与白帝城，江州居涪城之南、白帝城当三峡之口。
    { id: 'jiamengguan', name: '葭萌关', type: 'pass', population: 20000, provinceId: 'yi', owner: 'liuzhang', neighbors: ['yangpingguan', 'yinping', 'dingjunshan', 'fucheng'] },
    { id: 'fucheng', name: '涪城', type: 'city', population: 80000, provinceId: 'yi', owner: 'liuzhang', neighbors: ['mianzhu', 'luocheng', 'jiamengguan', 'yinping', 'jiangzhou'] },
    { id: 'mianzhu', name: '绵竹', type: 'city', population: 80000, provinceId: 'yi', owner: 'liuzhang', neighbors: ['luocheng', 'fucheng', 'chengdu'] },
    { id: 'luocheng', name: '雒城', type: 'city', population: 80000, provinceId: 'yi', owner: 'liuzhang', neighbors: ['chengdu', 'mianzhu', 'fucheng', 'jiangzhou'] },
    { id: 'chengdu', name: '成都', type: 'metropolis', population: 120000, provinceId: 'yi', owner: 'liuzhang', neighbors: ['luocheng', 'mianzhu', 'lushui'] },
    { id: 'jiangzhou', name: '江州', type: 'city', population: 80000, provinceId: 'yi', owner: 'liuzhang', neighbors: ['luocheng', 'fucheng', 'baidicheng'] },
    { id: 'baidicheng', name: '白帝城', type: 'city', population: 80000, provinceId: 'yi', owner: 'liuzhang', neighbors: ['zigui', 'jiangzhou'] },

    // 南中：南蛮自成一家的部族，以三江城为据、孟获为王；泸水是蜀军南渡金沙江处的无主野地，
    // 秃龙洞与三江城是南中的毒泉险地与屏障，桃花渡则是兀突骨屯藤甲兵的渡口，皆无归属。
    // 成都—泸水—秃龙洞—三江城—桃花渡串成一线，是自蜀中出入南中的一路，亦合《演义》南征的行军次序。
    { id: 'lushui', name: '泸水', type: 'field', population: 0, provinceId: 'yi', owner: null, neighbors: ['tulongdong', 'chengdu'] },
    { id: 'tulongdong', name: '秃龙洞', type: 'field', population: 0, provinceId: 'yi', owner: null, neighbors: ['sancheng', 'lushui'] },
    { id: 'sancheng', name: '三江城', type: 'town', population: 30000, provinceId: 'yi', owner: 'nanman', neighbors: ['tulongdong', 'taohuadu'] },
    { id: 'taohuadu', name: '桃花渡', type: 'field', population: 0, provinceId: 'yi', owner: null, neighbors: ['sancheng'] },
  ],
}
