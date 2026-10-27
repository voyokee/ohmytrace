package com.ohmytrace.app;

/** Pure rules for the one-tap album import, also exercised by JVM tests. */
final class PhotoLocation {
    private PhotoLocation() { }

    /** Missing, out-of-range and null-island coordinates are dropped, never guessed. */
    static boolean usable(double lat, double lon) {
        return Double.isFinite(lat) && Double.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
                && !(Math.abs(lat) < 1e-6 && Math.abs(lon) < 1e-6);
    }

    /** EXIF "yyyy:MM:dd HH:mm:ss" becomes "yyyy-MM-ddTHH:mm:ss"; malformed or zeroed values are null. */
    static String localTime(String exif) {
        if (exif == null) return null;
        String t = exif.trim();
        if (!t.matches("\\d{4}:\\d{2}:\\d{2} \\d{2}:\\d{2}:\\d{2}.*") || t.startsWith("0000")) return null;
        int month = Integer.parseInt(t.substring(5, 7)), day = Integer.parseInt(t.substring(8, 10));
        if (month < 1 || month > 12 || day < 1 || day > 31) return null;
        return t.substring(0, 4) + "-" + t.substring(5, 7) + "-" + t.substring(8, 10) + "T" + t.substring(11, 19);
    }

    /** EXIF offsets such as "+08:00" become minutes east of UTC; anything else is null. */
    static Integer offsetMinutes(String offset) {
        if (offset == null) return null;
        String o = offset.trim();
        if (!o.matches("[+-]\\d{2}:\\d{2}")) return null;
        int minutes = Integer.parseInt(o.substring(1, 3)) * 60 + Integer.parseInt(o.substring(4, 6));
        if (minutes > 14 * 60) return null;
        return o.charAt(0) == '-' ? -minutes : minutes;
    }
}
