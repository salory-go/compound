/**
 * Curated Quotes - 关于坚持、成长、复利的名人名言
 * 按日期 hash 选取，同一天看到同一句
 */

const quotes = [
    { text: '种一棵树最好的时间是十年前，其次是现在。', author: '中国谚语' },
    { text: '复利是世界第八大奇迹。理解它的人赚取它，不理解的人付出它。', author: 'Albert Einstein' },
    { text: '我们高估了一天能做的事，却低估了一年能做的事。', author: 'Bill Gates' },
    { text: '不是因为事情困难我们才不敢做，而是因为我们不敢做事情才变得困难。', author: 'Seneca' },
    { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
    { text: '每天进步1%，一年后你将进步37倍。', author: 'James Clear' },
    { text: '成功不是最终的，失败也不是致命的，重要的是继续前进的勇气。', author: 'Winston Churchill' },
    { text: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.', author: 'Aristotle' },
    { text: '千里之行，始于足下。', author: '老子' },
    { text: '你不需要很厉害才能开始，但你需要开始才能变得很厉害。', author: 'Zig Ziglar' },
    { text: 'The best time to plant a tree was 20 years ago. The second best time is now.', author: 'Chinese Proverb' },
    { text: '日拱一卒，功不唐捐。', author: '胡适' },
    { text: 'It does not matter how slowly you go as long as you do not stop.', author: 'Confucius' },
    { text: '所有伟大的事情都是由一系列小事情汇聚而成。', author: 'Vincent Van Gogh' },
    { text: '你的生活不会因为等待正确的时机才改变，它会因为你做出的每一个决定而改变。', author: '无名' },
    { text: 'Small daily improvements over time lead to stunning results.', author: 'Robin Sharma' },
    { text: '滴水穿石，不是力量大，而是功夫深。', author: '中国谚语' },
    { text: 'The only impossible journey is the one you never begin.', author: 'Tony Robbins' },
    { text: '人最大的敌人不是别人，而是自己的惰性。', author: '鲁迅' },
    { text: 'Consistency is what transforms average into excellence.', author: '无名' },
    { text: '今天的你已经比昨天更好了，哪怕只好了一点点。这就是复利。', author: 'Compound' },
    { text: '不积跬步，无以至千里；不积小流，无以成江海。', author: '荀子' },
    { text: 'Success is the sum of small efforts repeated day in and day out.', author: 'Robert Collier' },
    { text: '最慢的步伐不是跬步，而是徘徊。', author: '无名' },
    { text: 'The way to get started is to quit talking and begin doing.', author: 'Walt Disney' },
    { text: '人生就像滚雪球，重要的是找到湿的雪和很长的坡。', author: 'Warren Buffett' },
    { text: '坚持做一件小事，比做一百件大事更有力量。', author: '无名' },
    { text: 'Motivation is what gets you started. Habit is what keeps you going.', author: 'Jim Ryun' },
    { text: '你今天偷的每一个懒，都是给未来挖的坑。', author: '无名' },
    { text: 'A river cuts through rock not because of its power, but because of its persistence.', author: 'Jim Watkins' },
    { text: '真正的改变不是一夜之间发生的，而是一天一天累积而成。', author: '无名' },
];

/**
 * Get today's quote (deterministic by date)
 */
export function getTodayQuote() {
    const today = new Date();
    const dayOfYear = Math.floor(
        (today - new Date(today.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24)
    );
    const index = dayOfYear % quotes.length;
    return quotes[index];
}

/**
 * Get a random quote
 */
export function getRandomQuote() {
    return quotes[Math.floor(Math.random() * quotes.length)];
}
