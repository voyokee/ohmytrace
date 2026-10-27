package com.ohmytrace.app;
import org.junit.Test;
import static org.junit.Assert.*;
public class ScanWindowTest {
    @Test public void missingLocationAccessIsNotAnEmptyGpsLibrary() {
        ScanWindow.requireLocation(true);
        try { ScanWindow.requireLocation(false); fail("GPS-redacted reads must not proceed"); } catch (SecurityException expected) { assertTrue(expected.getMessage().contains("GPS_PERMISSION_REQUIRED")); }
    }
    @Test public void incrementalOnlyWithinSameLibraryAndPermissionScope() {
        assertTrue(ScanWindow.incremental("device:full:gps", "device:full:gps", "v1", "v1", false));
        assertFalse(ScanWindow.incremental("device:full:gps", "device:full:gps", "v1", "v2", false));
        assertFalse(ScanWindow.incremental("device:full", "device:full:gps", "v1", "v1", false));
        assertFalse(ScanWindow.incremental("partial", "partial", "v1", "v1", true));
    }
    @Test public void boundedRangesCannotOverflowOrReadBeyondSource() {
        ScanWindow.range(10, 20, 30);
        for (long offset : new long[]{-1, 31, Long.MAX_VALUE}) try { ScanWindow.range(offset, 1, 30); fail(); } catch (IllegalArgumentException expected) { }
        try { ScanWindow.range(0, 262145, Long.MAX_VALUE); fail(); } catch (IllegalArgumentException expected) { }
    }
    @Test public void rangeIsHalfOpenAndPagesAreBounded() {
        ScanWindow.validate(null, null, 100); ScanWindow.validate(1L, 2L, 1);
        try { ScanWindow.validate(2L, 2L, 100); fail(); } catch (IllegalArgumentException expected) { }
        try { ScanWindow.validate(null, null, 101); fail(); } catch (IllegalArgumentException expected) { }
    }
}
