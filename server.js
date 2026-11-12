const express = require('express');
const app = express();
const GROUPS = ['group1', 'group2', 'group3', 'group4', 'group5'];
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

// ⚠️ 注意：腾讯云环境不能直接写本地文件，所以数据存在内存里
// 重启服务数据会清空（单次活动完全够用，活动结束前别重启）
let submissions = []; 

app.use(express.json());
app.use(express.static('public'));

// 提交评分
app.post('/api/submit', (req, res) => {
    try {
        const { judgeName, role, scores } = req.body;
        if (!judgeName || !role || !scores) return res.status(400).json({ success: false, message: '缺少参数' });
        
        const exists = submissions.find(s => s.judgeName === judgeName && s.role === role);
        if (exists) return res.status(400).json({ success: false, message: '您已经提交过评分了' });

        submissions.push({ judgeName, role, scores });
        res.json({ success: true, message: '提交成功！' });
    } catch (error) {
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 获取结果（包含去最高最低分逻辑）
app.get('/api/results', (req, res) => {
    try {
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
        res.status(500).json({ success: false, message: '统计失败' });
    }
});

// 清空数据
app.post('/api/reset', (req, res) => {
    submissions = [];
    res.json({ success: true });
});

// ⚠️ 重点：腾讯云需要导出这个 app，而不是 listen 端口
module.exports = app;
