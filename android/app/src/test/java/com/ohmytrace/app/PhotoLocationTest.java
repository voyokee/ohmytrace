package com.ohmytrace.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import org.junit.Test;

public final class PhotoLocationTest {
    @Test public void dropsUnusableCoordinates() {
        assertTrue(PhotoLocation.usable(-8.65, 115.22));
        assertFalse(PhotoLocation.usable(0, 0));
        assertFalse(PhotoLocation.usable(Double.NaN, 115));
        assertFalse(PhotoLocation.usable(91, 10));
        assertFalse(PhotoLocation.usable(10, -181));
    }

    @Test public void parsesExifLocalTime() {
        assertEquals("2026-04-05T09:30:12", PhotoLocation.localTime("2026:04:05 09:30:12"));
        assertNull(PhotoLocation.localTime("0000:00:00 00:00:00"));
        assertNull(PhotoLocation.localTime("2026:13:05 09:30:12"));
        assertNull(PhotoLocation.localTime("yesterday"));
        assertNull(PhotoLocation.localTime(null));
    }

    @Test public void parsesExifOffsets() {
        assertEquals(Integer.valueOf(480), PhotoLocation.offsetMinutes("+08:00"));
        assertEquals(Integer.valueOf(-330), PhotoLocation.offsetMinutes("-05:30"));
        assertNull(PhotoLocation.offsetMinutes("+25:00"));
        assertNull(PhotoLocation.offsetMinutes("08:00"));
    }
}
