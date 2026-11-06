package cn.rili.calendar;

/**
 * 农历换算（1900-2100），与 www/js/lunar.js 同一套数据表。
 * 只做桌面小组件需要的部分：农历月日、干支年、生肖、星期。
 */
public final class Lunar {

    private static final int[] INFO = {
        0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0,
        0x09ad0, 0x055d2, 0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540,
        0x0d6a0, 0x0ada2, 0x095b0, 0x14977, 0x04970, 0x0a4b0, 0x0b4b5, 0x06a50,
        0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970, 0x06566, 0x0d4a0,
        0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
        0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2,
        0x0a950, 0x0b557, 0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573,
        0x052b0, 0x0a9a8, 0x0e950, 0x06aa0, 0x0aea6, 0x0ab50, 0x04b60, 0x0aae4,
        0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0, 0x096d0, 0x04dd5,
        0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6,
        0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46,
        0x0ab60, 0x09570, 0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58,
        0x055c0, 0x0ab60, 0x096d5, 0x092e0, 0x0c960, 0x0d954, 0x0d4a0, 0x0da50,
        0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5, 0x0a950, 0x0b4a0,
        0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
        0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260,
        0x0ea65, 0x0d530, 0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0,
        0x1d0b6, 0x0d250, 0x0d520, 0x0dd45, 0x0b5a0, 0x056d0, 0x055b2, 0x049b0,
        0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0, 0x14b63, 0x09370,
        0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0,
        0x0a2e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0,
        0x0a6d0, 0x055d4, 0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50,
        0x055a0, 0x0aba4, 0x0a5b0, 0x052b0, 0x0b273, 0x06930, 0x07337, 0x06aa0,
        0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160, 0x0e968, 0x0d520,
        0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252,
        0x0d520
    };

    private static final String[] GAN = {"甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"};
    private static final String[] ZHI = {"子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"};
    private static final String[] ANIMAL = {"鼠", "牛", "虎", "兔", "龙", "蛇", "马", "羊", "猴", "鸡", "狗", "猪"};
    private static final String[] MONTH_CN = {"正", "二", "三", "四", "五", "六", "七", "八", "九", "十", "冬", "腊"};
    private static final String[] DAY_CN = {
        "初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十",
        "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十",
        "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十"
    };

    private Lunar() {
    }

    private static int leapMonth(int y) {
        return INFO[y - 1900] & 0xf;
    }

    private static int leapDays(int y) {
        if (leapMonth(y) == 0) return 0;
        return (INFO[y - 1900] & 0x10000) != 0 ? 30 : 29;
    }

    private static int monthDays(int y, int m) {
        return (INFO[y - 1900] & (0x10000 >> m)) != 0 ? 30 : 29;
    }

    private static int yearDays(int y) {
        int sum = 348;
        for (int i = 0x8000; i > 0x8; i >>= 1) {
            if ((INFO[y - 1900] & i) != 0) sum++;
        }
        return sum + leapDays(y);
    }

    /** 公历日距 1970-01-01 的天数（Howard Hinnant 算法，纯整数运算） */
    static long daysFromCivil(int y, int m, int d) {
        int yy = y - (m <= 2 ? 1 : 0);
        int era = (yy >= 0 ? yy : yy - 399) / 400;
        int yoe = yy - era * 400;
        int doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;
        int doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        return era * 146097L + doe - 719468L;
    }

    private static final long EPOCH = daysFromCivil(1900, 1, 31);

    /** 星期日=0 ... 星期六=6 */
    public static int weekday(int y, int m, int d) {
        long days = daysFromCivil(y, m, d);
        return (int) ((days + 4) % 7 + 7) % 7;
    }

    public static String weekdayCn(int y, int m, int d) {
        return "周" + "日一二三四五六".charAt(weekday(y, m, d));
    }

    /** 农历月日文本，如「九月廿八」；越界返回空串 */
    public static String monthDayText(int y, int m, int d) {
        long offset = daysFromCivil(y, m, d) - EPOCH;
        if (offset < 0 || y > 2100) return "";

        int ly = 1900;
        while (ly <= 2100 && offset >= yearDays(ly)) {
            offset -= yearDays(ly);
            ly++;
        }
        int leap = leapMonth(ly);
        int lMonth = 1;
        boolean isLeap = false;
        for (int mm = 1; mm <= 12 && ly <= 2100; mm++) {
            int days = monthDays(ly, mm);
            if (offset < days) {
                lMonth = mm;
                isLeap = false;
                break;
            }
            offset -= days;
            if (leap == mm) {
                int ld = leapDays(ly);
                if (offset < ld) {
                    lMonth = mm;
                    isLeap = true;
                    break;
                }
                offset -= ld;
            }
        }
        int lDay = (int) offset + 1;
        if (lDay < 1 || lDay > 30) return "";
        return (isLeap ? "闰" : "") + MONTH_CN[lMonth - 1] + "月" + DAY_CN[lDay - 1];
    }

    /** 干支年 + 生肖，如「丙午马」 */
    public static String ganzhiAnimal(int lYear) {
        int i = (lYear - 4) % 60;
        if (i < 0) i += 60;
        return GAN[i % 10] + ZHI[i % 12] + ANIMAL[Math.floorMod(lYear - 4, 12)];
    }

    /** 干支生肖：按当日所属农历年计算 */
    public static String ganzhiAnimalOf(int y, int m, int d) {
        int lYear = lunarYear(y, m, d);
        return lYear > 0 ? ganzhiAnimal(lYear) : "";
    }

    /** 当日所属农历年 */
    public static int lunarYear(int y, int m, int d) {
        long offset = daysFromCivil(y, m, d) - EPOCH;
        if (offset < 0 || y > 2100) return 0;
        int ly = 1900;
        while (ly <= 2100 && offset >= yearDays(ly)) {
            offset -= yearDays(ly);
            ly++;
        }
        return ly <= 2100 ? ly : 0;
    }
}
