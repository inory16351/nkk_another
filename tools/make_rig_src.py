"""캐릭터별 관절 표 → art/<id>/rig_src.json (옆모습 인간형 리그 공통 틀)

관절 좌표는 full_side.png(1024×1536) 픽셀. 격자 그림 art/<id>/_grid.png 를 보고 찍음.
사용: python tools/make_rig_src.py [id...]  → 그 뒤 python tools/rig_cut.py art/<id>
"""
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'art')

# neck · waist = 몸통 / hips = 골반(치마 · 엉덩이) 위→아래 / sh · el · hand = 칼 팔 / grip · tip = 무기
# legN = 뒤쪽 다리(엉덩이 · 무릎 · 발목) / legF = 앞쪽 다리 / tail = 꼬리 점 4개 (없으면 생략)
# head = 머리 다각형 / handBox = 손 영역 [x0,y0,x1,y1] (+ handColor) / weapon = 무기 다각형 목록
# cape = 망토 다각형 (+ capeColor) / tailPoly · tailColor / hipsPoly / feet = {shinN: 다각형, shinF: 다각형}
C = {
    'lancer': dict(
        ground=[460, 1405], neck=[480, 785], waist=[520, 990], hips=[[520, 1000], [520, 1150]],
        sh=[655, 848], el=[708, 848], hand=[800, 842], grip=[815, 842], tip=[815, 30],
        legN=[[400, 1170], [395, 1268], [390, 1380]], legF=[[565, 1170], [575, 1268], [590, 1370]],
        tail=[[300, 1210], [190, 1200], [140, 1020], [70, 895]],
        head=[[100, 180], [760, 180], [760, 700], [640, 765], [470, 785], [230, 765], [100, 700]],
        handBox=[765, 795, 865, 885], handColor='pink',
        weapon=[[[770, 20], [870, 20], [870, 270], [990, 320], [990, 545], [860, 470], [845, 1425], [790, 1425], [800, 470]]], weaponColor='notpink',
        cape=[[140, 760], [340, 775], [335, 1245], [140, 1245]], capeBone=[[330, 800], [230, 1180]],
        tailPoly=[[20, 860], [300, 860], [300, 1265], [20, 1265]], tailColor='pink',
        arm={'upperArm': [[662, 798], [708, 798], [708, 898], [662, 898]], 'foreArm': [[708, 795], [770, 795], [770, 898], [708, 898]]},
        fill=[[400, 790], [665, 790], [665, 1000], [400, 1000]],
        hipsPoly=[[335, 985], [700, 985], [700, 1203], [335, 1203]],
        legs={'thighN': [[320, 1203], [487, 1203], [487, 1272], [320, 1272]], 'thighF': [[487, 1203], [660, 1203], [660, 1272], [487, 1272]]}),
    'archer': dict(
        ground=[520, 1390], neck=[560, 690], waist=[560, 930], hips=[[560, 930], [560, 1030]],
        sh=[600, 760], el=[690, 800], hand=[775, 790], grip=[775, 790], tip=[990, 705],
        legN=[[480, 1030], [470, 1170], [460, 1330]], legF=[[600, 1030], [610, 1170], [620, 1310]],
        tail=[[430, 1080], [300, 1160], [180, 1060], [50, 1000]],
        head=[[150, 120], [740, 120], [740, 600], [600, 680], [420, 690], [300, 640], [150, 420]],
        handBox=[730, 740, 820, 845], handColor='pink',
        weapon=[[[580, 640], [1000, 640], [1000, 730], [830, 735], [810, 865], [745, 865], [745, 730], [580, 725]]], weaponColor='notpink',
        cape=[[260, 620], [440, 640], [420, 1110], [260, 1110]], capeBone=[[440, 680], [340, 1080]],
        tailPoly=[[30, 975], [440, 975], [440, 1185], [30, 1185]], tailColor='pink',
        hipsPoly=[[400, 900], [660, 900], [660, 1040], [400, 1040]]),
    'mage': dict(
        ground=[560, 1440], neck=[560, 640], waist=[520, 900], hips=[[520, 920], [520, 1300]],
        sh=[580, 740], el=[700, 820], hand=[860, 780], grip=[860, 775], tip=[900, 280],
        legN=[[430, 1300], [430, 1360], [420, 1430]], legF=[[650, 1300], [660, 1350], [680, 1420]],
        tail=[[260, 1270], [130, 1180], [110, 920], [50, 850]],
        head=[[140, 40], [830, 40], [830, 600], [700, 650], [500, 665], [330, 645], [260, 560], [140, 300]],
        handBox=[800, 720, 900, 830], handColor='pink',
        weapon=[[[810, 270], [1000, 270], [1000, 580], [900, 600], [880, 1440], [805, 1440], [825, 600]]], weaponColor='notpink',
        tailPoly=[[20, 820], [280, 820], [280, 1320], [20, 1320]], tailColor='pink',
        hipsPoly=[[240, 900], [800, 900], [800, 1375], [240, 1375]],
        feet={'shinN': [[350, 1375], [590, 1375], [590, 1470], [350, 1470]], 'shinF': [[590, 1360], [800, 1360], [800, 1460], [590, 1460]]}),
    'priest': dict(
        ground=[520, 1470], neck=[520, 600], waist=[520, 830], hips=[[520, 850], [520, 1300]],
        sh=[540, 670], el=[680, 690], hand=[830, 650], grip=[830, 640], tip=[845, 80],
        legN=[[400, 1330], [380, 1380], [370, 1460]], legF=[[650, 1330], [680, 1380], [700, 1450]],
        tail=[[300, 1210], [170, 1200], [100, 1000], [60, 830]],
        head=[[150, 50], [760, 50], [760, 520], [600, 600], [400, 600], [300, 560], [150, 420]],
        handBox=[780, 590, 880, 710], handColor='pink',
        weapon=[[[730, 70], [960, 70], [960, 400], [870, 420], [860, 1400], [790, 1400], [810, 420], [730, 400]]], weaponColor='notpink',
        cape=[[150, 450], [330, 600], [330, 1180], [150, 1180]], capeBone=[[330, 600], [230, 1100]],
        tailPoly=[[30, 800], [300, 800], [300, 1260], [30, 1260]], tailColor='pink',
        hipsPoly=[[240, 830], [790, 830], [790, 1395], [240, 1395]],
        feet={'shinN': [[290, 1395], [450, 1395], [450, 1490], [290, 1490]], 'shinF': [[600, 1385], [820, 1385], [820, 1485], [600, 1485]]}),
    'h_spear': dict(
        ground=[450, 1480], neck=[470, 745], waist=[500, 1000], hips=[[500, 1010], [500, 1200]],
        sh=[420, 790], el=[470, 940], hand=[790, 870], grip=[800, 870], tip=[800, 30],
        legN=[[380, 1220], [350, 1300], [320, 1420]], legF=[[510, 1220], [540, 1300], [560, 1420]],
        head=[[190, 230], [780, 230], [780, 640], [640, 720], [470, 760], [300, 720], [190, 640]],
        handBox=[735, 790, 860, 955],
        weapon=[[[755, 20], [845, 20], [845, 320], [818, 320], [818, 792], [783, 792], [783, 320], [755, 320]],
                [[783, 958], [818, 958], [845, 1350], [845, 1475], [755, 1475], [755, 1350]]],
        cape=[[150, 720], [330, 735], [330, 1260], [150, 1260]], capeBone=[[330, 760], [220, 1200]],
        hipsPoly=[[320, 995], [710, 995], [710, 1225], [320, 1225]]),
    'h_xbow': dict(
        ground=[380, 1390], neck=[360, 560], waist=[360, 800], hips=[[360, 810], [360, 950]],
        sh=[400, 640], el=[500, 650], hand=[620, 650], grip=[620, 650], tip=[1000, 580],
        legN=[[320, 960], [270, 1100], [230, 1310]], legF=[[420, 960], [440, 1100], [450, 1300]],
        head=[[80, 80], [650, 80], [650, 560], [470, 600], [300, 575], [150, 520], [80, 460]],
        handBox=[540, 600, 680, 720], handColor='pink',
        weapon=[[[430, 500], [1010, 500], [1010, 700], [720, 720], [560, 700], [430, 640]]], weaponColor='notpink',
        cape=[[30, 540], [300, 540], [260, 1060], [30, 1060]], capeBone=[[280, 600], [150, 950]],
        hipsPoly=[[230, 790], [500, 790], [500, 970], [230, 970]]),
    'h_boss': dict(
        ground=[550, 1475], neck=[500, 690], waist=[500, 1000], hips=[[520, 1000], [520, 1160]],
        sh=[520, 780], el=[600, 880], hand=[810, 850], grip=[815, 850], tip=[830, 70],
        legN=[[470, 1170], [450, 1280], [440, 1420]], legF=[[580, 1170], [600, 1280], [620, 1420]],
        head=[[50, 40], [720, 40], [720, 620], [600, 700], [420, 700], [330, 640], [50, 480]],
        handBox=[740, 790, 880, 910],
        weapon=[[[710, 60], [950, 60], [950, 250], [900, 700], [970, 700], [970, 785], [680, 785], [680, 700], [750, 700], [720, 250]],
                [[780, 910], [870, 910], [870, 1030], [780, 1030]]],
        cape=[[110, 640], [400, 660], [400, 1230], [110, 1230]], capeBone=[[420, 700], [250, 1150]],
        hipsPoly=[[390, 990], [690, 990], [690, 1175], [390, 1175]]),
    'c_scout': dict(
        ground=[540, 1400], neck=[560, 640], waist=[560, 880], hips=[[560, 880], [560, 1000]],
        sh=[590, 740], el=[720, 790], hand=[840, 770], grip=[840, 760], tip=[930, 500],
        legN=[[470, 1000], [470, 1180], [470, 1330]], legF=[[600, 1000], [620, 1180], [630, 1320]],
        tail=[[420, 1050], [300, 1120], [150, 1050], [60, 940]],
        head=[[200, 180], [770, 180], [770, 600], [650, 650], [480, 660], [300, 620], [200, 550]],
        handBox=[770, 700, 880, 800],
        weapon=[[[790, 480], [960, 480], [960, 720], [880, 720], [840, 850], [760, 850], [790, 720]]],
        cape=[[280, 620], [460, 640], [440, 1050], [280, 1050]], capeBone=[[460, 680], [360, 1010]],
        tailPoly=[[40, 920], [230, 920], [330, 1055], [440, 1030], [440, 1175], [40, 1175]],
        hipsPoly=[[400, 850], [680, 850], [680, 1010], [400, 1010]]),
    'c_knight': dict(
        ground=[520, 1400], neck=[530, 610], waist=[540, 840], hips=[[540, 840], [540, 1060]],
        sh=[580, 720], el=[690, 730], hand=[840, 700], grip=[850, 690], tip=[860, 210],
        legN=[[470, 1080], [460, 1190], [460, 1340]], legF=[[600, 1080], [620, 1190], [650, 1330]],
        tail=[[400, 1050], [250, 1080], [150, 950], [60, 880]],
        head=[[330, 180], [730, 180], [730, 560], [600, 610], [420, 610], [330, 560]],
        handBox=[770, 650, 880, 770],
        weapon=[[[740, 190], [1000, 190], [1000, 420], [880, 440], [860, 880], [790, 880], [810, 440], [740, 420]]],
        cape=[[270, 600], [470, 620], [440, 1000], [270, 1000]], capeBone=[[460, 640], [350, 960]],
        tailPoly=[[40, 830], [330, 830], [400, 1060], [400, 1115], [40, 1115]], tailColor='dark',
        hipsPoly=[[400, 830], [700, 830], [700, 1080], [400, 1080]]),
}


def build(cid, c):
    sc = lambda p: [int(p[0]), int(p[1])]
    bones = {
        'hips': {'parent': None, 'a': sc(c['hips'][0]), 'b': sc(c['hips'][1])},
        'torso': {'parent': 'hips', 'a': sc(c['waist']), 'b': sc(c['neck']), 'bias': 40},
        'head': {'parent': 'torso', 'a': sc(c['neck']), 'b': [c['neck'][0], c['neck'][1] - 300], 'cap': 40},
        'upperArm': {'parent': 'torso', 'a': sc(c['sh']), 'b': sc(c['el'])},
        'foreArm': {'parent': 'upperArm', 'a': sc(c['el']), 'b': sc(c['hand'])},
        'weapon': {'parent': 'foreArm', 'a': sc(c['grip']), 'b': sc(c['tip']), 'keep': True, 'cap': 0},
        'thighN': {'parent': 'hips', 'a': sc(c['legN'][0]), 'b': sc(c['legN'][1])},
        'shinN': {'parent': 'thighN', 'a': sc(c['legN'][1]), 'b': sc(c['legN'][2])},
        'thighF': {'parent': 'hips', 'a': sc(c['legF'][0]), 'b': sc(c['legF'][1])},
        'shinF': {'parent': 'thighF', 'a': sc(c['legF'][1]), 'b': sc(c['legF'][2])},
    }
    if 'cape' in c:
        bones['cape'] = {'parent': 'torso', 'a': sc(c['capeBone'][0]), 'b': sc(c['capeBone'][1])}
    if 'tail' in c:
        t = c['tail']
        bones['tail1'] = {'parent': 'hips', 'a': sc(t[0]), 'b': sc(t[1])}
        bones['tail2'] = {'parent': 'tail1', 'a': sc(t[1]), 'b': sc(t[2]), 'cap': 14}
        bones['tail3'] = {'parent': 'tail2', 'a': sc(t[2]), 'b': sc(t[3]), 'cap': 12}
    hb = c['handBox']
    rules = [dict(to='foreArm', poly=[[hb[0], hb[1]], [hb[2], hb[1]], [hb[2], hb[3]], [hb[0], hb[3]]], **({'color': c['handColor']} if c.get('handColor') else {}))]
    for poly in c['weapon']:
        r = {'to': 'weapon', 'grow': 6, 'poly': poly}
        if c.get('weaponColor'):
            r['color'] = c['weaponColor']
        rules.append(r)
    if 'tail' in c:
        r = {'to': ['tail1', 'tail2', 'tail3'], 'poly': c['tailPoly']}
        if c.get('tailColor'):
            r['color'] = c['tailColor']
        rules.append(r)
    rules.append({'to': 'head', 'poly': c['head']})
    if 'cape' in c:
        r = {'to': 'cape', 'poly': c['cape']}
        if c.get('capeColor'):
            r['color'] = c['capeColor']
        rules.append(r)
    # 팔 · 다리를 다각형으로 직접 지정 (가까운 뼈로 나누면 가슴 문장 · 옷자락이 팔다리에 딸려 감)
    for part, poly in c.get('arm', {}).items():
        rules.append({'to': part, 'poly': poly})
    rules.append({'to': 'hips', 'poly': c['hipsPoly']})
    for part, poly in c.get('legs', {}).items():
        rules.append({'to': part, 'poly': poly})
    for part, poly in c.get('feet', {}).items():
        rules.append({'to': part, 'poly': poly})
    order = (['cape'] if 'cape' in c else []) + (['tail3', 'tail2', 'tail1'] if 'tail' in c else []) + \
        ['foreArmF', 'upperArmF', 'shinF', 'thighF', 'shinN', 'thighN', 'hips', 'torso', 'head', 'weapon', 'upperArm', 'foreArm']
    sh = c['sh']
    extra = {}
    if 'fill' in c:  # 팔에 가려졌던 몸통 자리 메우기
        extra['fill'] = {'torso': {'from': ['upperArm', 'foreArm'], 'poly': c['fill']}}
    # 골반 받침: 몸통 아래쪽 70px 띠 (몸통이 숙거나 젖혀도 허리에 틈이 안 생김)
    hp = c['hipsPoly']
    hx0, hx1 = min(p[0] for p in hp) - 20, max(p[0] for p in hp) + 20
    hy = min(p[1] for p in hp)
    extra['under'] = {'hips': {'from': ['torso', 'cape'], 'poly': [[hx0, hy - 70], [hx1, hy - 70], [hx1, hy + 5], [hx0, hy + 5]]}}
    if 'tail' in c:
        bones['tail2']['cap'] = 30
        bones['tail3']['cap'] = 26
        bones['tail1']['cap'] = 30
    return {'scale': 0.5, 'views': {'side': {
        'src': 'full_side.png', 'ground': c['ground'], 'cap': 24, 'bones': bones, **extra,
        'clones': {'upperArmF': {'from': 'upperArm', 'parent': 'torso', 'pivot': [sh[0] - 30, sh[1] - 10], 'dark': 0.68},
                   'foreArmF': {'from': 'foreArm', 'parent': 'upperArmF', 'dark': 0.68}},
        'rules': rules,
        'default': ['torso', 'upperArm', 'foreArm', 'thighN', 'shinN', 'thighF', 'shinF'],
        'order': order,
    }}}


if __name__ == '__main__':
    ids = sys.argv[1:] or list(C)
    for cid in ids:
        out = os.path.join(ROOT, cid, 'rig_src.json')
        json.dump(build(cid, C[cid]), open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print('저장', out)
