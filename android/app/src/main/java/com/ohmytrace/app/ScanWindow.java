package com.ohmytrace.app;

/** Platform-independent paging rules, also exercised by JVM tests. */
final class ScanWindow {
    static void requireDevice(String expected,String actual){if(expected!=null&&!expected.isEmpty()&&!expected.equals(actual))throw new SecurityException("原图不在本机");}
    static void requireLocation(boolean authorized) {
        if (!authorized) throw new SecurityException("GPS_PERMISSION_REQUIRED：照片位置未授权，已停止扫描。请允许读取照片 GPS 后重新扫描。");
    }
    static boolean incremental(String oldScope, String scope, String oldVersion, String version, boolean limited) {
        return !limited && scope.equals(oldScope) && version.equals(oldVersion);
    }
    static void validate(Long start, Long end, int pageSize) {
        if (start != null && end != null && start >= end) throw new IllegalArgumentException("结束时间必须晚于开始时间");
        if (pageSize < 1 || pageSize > 100) throw new IllegalArgumentException("相册分页数量无效");
    }
    static void range(long offset, int length, long size) {
        if (offset < 0 || length < 0 || length > 262144 || offset > size || length > size - offset)
            throw new IllegalArgumentException("NATIVE_READ_BUDGET");
    }
}
