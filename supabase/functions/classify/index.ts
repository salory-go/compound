import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const GEMINI_MODEL = 'gemini-3-pro-preview';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_PROMPT = `你是「复利引擎」的思维拆解器。任务：把一篇日记拆成独立思想块，并归入主题。

## 工作流程（先规划主题，再分块归入）

Step 1: 通读全文，识别 2-4 个大主题方向（优先复用已有主题，不够再建议新的）
Step 2: 拆分文段，每块归入 1-3 个主题

## 规则

1. **拆块**：把日记拆成独立思想单元，每块 20-80 字，可脱离原文独立理解。
2. **不丢内容**：思考、洞察、决策、行动计划必须保留。纯叙事可跳过。
3. **保留原意**：提炼不改变用户表达。
4. **主题数量约束**：
   - 建议新主题 ≤ 4 个，应该是宽泛的母题（"行动哲学"），不是细粒度标签（"早睡"）
   - 每个新主题至少要覆盖 2 个块，不要为单个块单独建主题
   - 优先复用已有主题
5. **多主题**：一个块可以属于多个主题
6. **预分配**：每个块必须至少归入 1 个主题（已有或建议的），不要留空

## 输出格式

严格 JSON：

{
  "suggestedTopics": [
    {"tempId": "st_1", "name": "主题名2-6字", "description": "一句话描述"}
  ],
  "blocks": [
    {"content": "拆出的文段", "topicIds": ["t_xxx"], "suggestedTopicIds": ["st_1"]}
  ]
}

- suggestedTopics: 建议新建的主题（tempId 用 st_1, st_2... 格式）
- blocks[].topicIds: 归入的已有主题 ID 数组
- blocks[].suggestedTopicIds: 归入的建议新主题 tempId 数组
- 每个 block 的 topicIds + suggestedTopicIds 合计 ≥ 1`;

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
            },
        });
    }

    try {
        const apiKey = Deno.env.get('GEMINI_API_KEY');
        if (!apiKey) {
            return new Response(
                JSON.stringify({ error: 'GEMINI_API_KEY not configured' }),
                { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
            );
        }

        const body = await req.json();
        const { text, entryId, topics } = body;

        if (!text || !entryId) {
            return new Response(
                JSON.stringify({ error: 'Missing text or entryId' }),
                { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
            );
        }

        let userMsg = `请拆解以下日记 [${entryId}]：\n\n${text}\n\n`;

        if (topics && topics.length > 0) {
            userMsg += '已有主题列表（优先复用，用 id 引用）：\n';
            for (const t of topics) {
                userMsg += `- id: ${t.id} | ${t.name}: ${t.description || '无描述'}\n`;
            }
        } else {
            userMsg += '还没有任何已有主题，请在 suggestedTopics 中建议 2-4 个宽泛主题。\n';
        }

        const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                system_instruction: {
                    parts: [{ text: SYSTEM_PROMPT }]
                },
                contents: [{
                    role: 'user',
                    parts: [{ text: userMsg }],
                }],
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 8192,
                    responseMimeType: 'application/json',
                    thinkingConfig: { thinkingBudget: 4096 },
                },
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('Gemini API error:', response.status, errText);
            return new Response(
                JSON.stringify({ error: `LLM API error: ${response.status}` }),
                { status: 502, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
            );
        }

        const data = await response.json();
        const parts = data.candidates?.[0]?.content?.parts || [];
        const textPart = parts.find((p: any) => p.text && !p.thought);
        const rawText = textPart?.text || parts[parts.length - 1]?.text || '{}';

        let result;
        try {
            result = JSON.parse(rawText);
        } catch {
            console.error('Failed to parse AI response:', rawText);
            return new Response(
                JSON.stringify({ error: 'AI returned invalid JSON', raw: rawText }),
                { status: 502, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
            );
        }

        // Normalize: ensure suggestedTopics and blocks exist
        if (!result.suggestedTopics) result.suggestedTopics = [];
        if (!result.blocks) result.blocks = [];
        for (const b of result.blocks) {
            if (!b.topicIds) b.topicIds = [];
            if (!b.suggestedTopicIds) b.suggestedTopicIds = [];
        }

        return new Response(
            JSON.stringify(result),
            { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
        );
    } catch (e) {
        console.error('Edge function error:', e);
        return new Response(
            JSON.stringify({ error: e.message }),
            { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
        );
    }
});
