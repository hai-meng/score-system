const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

const DATA_FILE = path.join(__dirname, 'data', 'scores.json');
const GROUPS = ['group1', 'group2', 'group3', 'group4', 'group5'];

// 👇这里修改了小组名称
const GROUP_NAMES = {
    group1: '1. “食”全“食”美小组',
    group2: '2. 美食美“克”小组',
    group3: '3. 满汉全席小组',
    group4: '4. 美味营养小组',
    group5: '5. 食“光”小组'
};

const ROLES = {
    professional: { weight: 0.5, name: '专业评委' },
    public:       { weight: 0.3, name: '大众评委' },
    student:      { weight: 0.2, name: '学生评委' }
};

function ensureDataFile() {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify({ submissions: [] }, null, 2));
    }
}

function readData() {
    ensureDataFile();
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    } catch (e) {
        return { submissions: [] };
    }
}

function writeData(data) {
    ensureDataFile();
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ========== 1. 提交评分接口 ==========
app.post('/api/submit', (req, res) => {
    try {
        const { judgeName, role, scores } = req.body;
        if (!judgeName || !role || !scores) {
            return res.status(400).json({ success: false, message: '缺少参数' });
        }
        
        const data = readData();
        const exists = data.submissions.find(s => s.judgeName === judgeName && s.role === role);
        if (exists) {
            return res.status(400).json({ success: false, message: '您已经提交过评分了' });
        }

        data.submissions.push({
            judgeName,
            role,
            scores,
            submittedAt: new Date().toISOString()
        });
        writeData(data);

        res.json({ success: true, message: '提交成功！' });
    } catch (error) {
        console.error('提交出错:', error);
        res.status(500).json({ success: false, message: '服务器内部错误' });
    }
});

// ========== 2. 后台获取结果接口 ==========
app.get('/api/results', (req, res) => {
    try {
        const data = readData();
        const submissions = data.submissions || [];

        const groupResults = {};
        GROUPS.forEach(g => {
            groupResults[g] = { groupName: GROUP_NAMES[g], breakdown: {}, totalScore: 0 };
            Object.keys(ROLES).forEach(role => {
                groupResults[g].breakdown[role] = { roleName: ROLES[role].name, weight: ROLES[role].weight, scores: [] };
            });
        });

        submissions.forEach(sub => {
            if (!sub.scores) return;
            GROUPS.forEach(g => {
                const score = Number(sub.scores[g]);
                if (!isNaN(score) && score >= 0) {
                    groupResults[g].breakdown[sub.role].scores.push(score);
                }
            });
        });

        function calcStats(scores) {
            if (scores.length === 0) return { avg: 0, count: 0, removedMin: 0, removedMax: 0, usedCount: 0 };
            let used = [...scores];
            let removedMin = 0, removedMax = 0;
            if (scores.length >= 3) {
                const sorted = [...scores].sort((a, b) => a - b);
                removedMin = sorted[0];
                removedMax = sorted[sorted.length - 1];
                used = sorted.slice(1, -1);
            }
            const avg = used.reduce((a, b) => a + b, 0) / used.length;
            return { avg, count: scores.length, removedMin, removedMax, usedCount: used.length };
        }

        const finalGroups = GROUPS.map(g => {
            let total = 0;
            const breakdown = [];
            Object.keys(ROLES).forEach(role => {
                const roleData = groupResults[g].breakdown[role];
                const stats = calcStats(roleData.scores);
                total += stats.avg * ROLES[role].weight;
                breakdown.push({ role, roleName: roleData.roleName, weight: roleData.weight, ...stats });
            });
            return { groupId: g, groupName: GROUP_NAMES[g], totalScore: total, breakdown };
        });

        const rankedGroups = [...finalGroups].sort((a, b) => b.totalScore - a.totalScore);
        rankedGroups.forEach((g, idx) => g.rank = idx + 1);

        res.json({
            success: true,
            totalSubmissions: submissions.length,
            groups: finalGroups,
            ranked: rankedGroups
        });
    } catch (error) {
        console.error('获取结果出错:', error);
        res.status(500).json({ success: false, message: '统计失败' });
    }
});

// ========== 3. 清空数据 ==========
app.post('/api/reset', (req, res) => {
    writeData({ submissions: [] });
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`✅ 服务已启动: http://localhost:${PORT}`);
});