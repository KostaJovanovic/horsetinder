package com.horsetinder.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * The updater's version compare. If it breaks, installed phones stop seeing
 * updates, and the fix can't reach them through the updater.
 * Labels come from save.bat: "0." plus the commit count, two digits at least.
 */
public class UpdatePluginTest {

    @Test
    public void newerComparesNumberByNumber() {
        assertTrue(UpdatePlugin.newer("0.10", "0.09"));
        assertTrue(UpdatePlugin.newer("0.100", "0.99"));
        assertTrue(UpdatePlugin.newer("1.00", "0.999"));
    }

    @Test
    public void sameOrOlderIsNotNewer() {
        assertFalse(UpdatePlugin.newer("0.05", "0.05"));
        assertFalse(UpdatePlugin.newer("0.04", "0.05"));
        assertFalse(UpdatePlugin.newer("0.99", "0.100"));
    }

    @Test
    public void aBadTagIsNeverNewer() {
        assertFalse(UpdatePlugin.newer("", "0.05"));
        assertFalse(UpdatePlugin.newer("latest", "0.05"));
        assertFalse(UpdatePlugin.newer("v0.06", "0.05")); // the caller strips the v
    }
}
