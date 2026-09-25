package com.horsetinder.app;

import android.Manifest;
import android.accounts.Account;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CalendarContract;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.TimeZone;

/**
 * Writes horse dates straight into Android's calendar storage (CalendarContract).
 * The app itself never goes online: if the phone has a Google account with calendar
 * sync on, Android's own sync adapter carries the events to Google Calendar.
 */
@CapacitorPlugin(
    name = "HorseCalendar",
    permissions = {
        @Permission(strings = { Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR }, alias = "calendar")
    }
)
public class CalendarPlugin extends Plugin {

    private static final String LOCAL_ACCOUNT = "Horse Tinder";

    private boolean ensurePermission(PluginCall call) {
        if (getPermissionState("calendar") == PermissionState.GRANTED) return true;
        requestPermissionForAlias("calendar", call, "permissionCallback");
        return false;
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        if (getPermissionState("calendar") != PermissionState.GRANTED) {
            call.reject("Calendar permission was denied.", "DENIED");
            return;
        }
        switch (call.getMethodName()) {
            case "listCalendars": listCalendars(call); break;
            case "addEvent": addEvent(call); break;
            case "deleteEvent": deleteEvent(call); break;
            default: call.resolve();
        }
    }

    /** Calendars the app can write to, Google ones first. */
    @PluginMethod
    public void listCalendars(PluginCall call) {
        if (!ensurePermission(call)) return;
        JSArray list = new JSArray();
        String[] projection = {
            CalendarContract.Calendars._ID,
            CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
            CalendarContract.Calendars.ACCOUNT_NAME,
            CalendarContract.Calendars.ACCOUNT_TYPE,
            CalendarContract.Calendars.IS_PRIMARY,
        };
        String where = CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL + " >= " + CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR;
        try (Cursor c = getContext().getContentResolver().query(CalendarContract.Calendars.CONTENT_URI, projection, where, null, null)) {
            if (c != null) {
                while (c.moveToNext()) {
                    JSObject o = new JSObject();
                    o.put("id", c.getLong(0));
                    o.put("name", c.getString(1));
                    o.put("account", c.getString(2));
                    o.put("google", "com.google".equals(c.getString(3)));
                    o.put("primary", c.getInt(4) == 1);
                    list.put(o);
                }
            }
        } catch (Exception e) {
            call.reject("Couldn't read calendars: " + e.getMessage());
            return;
        }
        JSObject ret = new JSObject();
        ret.put("calendars", list);
        call.resolve(ret);
    }

    /**
     * { title, description, location, start (ms), end (ms), calendarId?, reminderMinutes? }
     * Without calendarId: the primary Google calendar, else any writable one, else a
     * local "Horse Tinder" calendar created on the phone.
     */
    @PluginMethod
    public void addEvent(PluginCall call) {
        if (!ensurePermission(call)) return;
        Long start = call.getLong("start");
        Long end = call.getLong("end");
        if (start == null || end == null) {
            call.reject("start and end are required");
            return;
        }
        try {
            ContentResolver cr = getContext().getContentResolver();
            long calendarId = call.getLong("calendarId", -1L);
            if (calendarId < 0) calendarId = pickCalendar(cr);
            if (calendarId < 0) calendarId = createLocalCalendar(cr);

            ContentValues v = new ContentValues();
            v.put(CalendarContract.Events.CALENDAR_ID, calendarId);
            v.put(CalendarContract.Events.TITLE, call.getString("title", "Horse date"));
            v.put(CalendarContract.Events.DESCRIPTION, call.getString("description", ""));
            v.put(CalendarContract.Events.EVENT_LOCATION, call.getString("location", ""));
            v.put(CalendarContract.Events.DTSTART, start);
            v.put(CalendarContract.Events.DTEND, end);
            v.put(CalendarContract.Events.EVENT_TIMEZONE, TimeZone.getDefault().getID());
            Uri uri = cr.insert(CalendarContract.Events.CONTENT_URI, v);
            if (uri == null) {
                call.reject("The calendar didn't accept the event.");
                return;
            }
            long eventId = ContentUris.parseId(uri);

            int reminder = call.getInt("reminderMinutes", -1);
            if (reminder >= 0) {
                ContentValues r = new ContentValues();
                r.put(CalendarContract.Reminders.EVENT_ID, eventId);
                r.put(CalendarContract.Reminders.MINUTES, reminder);
                r.put(CalendarContract.Reminders.METHOD, CalendarContract.Reminders.METHOD_ALERT);
                cr.insert(CalendarContract.Reminders.CONTENT_URI, r);
            }

            JSObject ret = new JSObject();
            ret.put("eventId", eventId);
            ret.put("calendarId", calendarId);
            ret.put("calendarName", calendarName(cr, calendarId));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Couldn't add the event: " + e.getMessage());
        }
    }

    @PluginMethod
    public void deleteEvent(PluginCall call) {
        if (!ensurePermission(call)) return;
        Long id = call.getLong("eventId");
        if (id == null) {
            call.reject("eventId is required");
            return;
        }
        int rows = getContext().getContentResolver().delete(ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, id), null, null);
        JSObject ret = new JSObject();
        ret.put("deleted", rows > 0);
        call.resolve(ret);
    }

    private long pickCalendar(ContentResolver cr) {
        String[] projection = { CalendarContract.Calendars._ID, CalendarContract.Calendars.ACCOUNT_TYPE, CalendarContract.Calendars.IS_PRIMARY };
        String where = CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL + " >= " + CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR;
        long best = -1;
        int bestScore = -1;
        try (Cursor c = cr.query(CalendarContract.Calendars.CONTENT_URI, projection, where, null, null)) {
            if (c == null) return -1;
            while (c.moveToNext()) {
                int score = ("com.google".equals(c.getString(1)) ? 2 : 0) + (c.getInt(2) == 1 ? 1 : 0);
                if (score > bestScore) {
                    bestScore = score;
                    best = c.getLong(0);
                }
            }
        }
        return best;
    }

    private long createLocalCalendar(ContentResolver cr) {
        Uri uri = CalendarContract.Calendars.CONTENT_URI.buildUpon()
            .appendQueryParameter(CalendarContract.CALLER_IS_SYNCADAPTER, "true")
            .appendQueryParameter(CalendarContract.Calendars.ACCOUNT_NAME, LOCAL_ACCOUNT)
            .appendQueryParameter(CalendarContract.Calendars.ACCOUNT_TYPE, CalendarContract.ACCOUNT_TYPE_LOCAL)
            .build();
        ContentValues v = new ContentValues();
        v.put(CalendarContract.Calendars.ACCOUNT_NAME, LOCAL_ACCOUNT);
        v.put(CalendarContract.Calendars.ACCOUNT_TYPE, CalendarContract.ACCOUNT_TYPE_LOCAL);
        v.put(CalendarContract.Calendars.NAME, LOCAL_ACCOUNT);
        v.put(CalendarContract.Calendars.CALENDAR_DISPLAY_NAME, LOCAL_ACCOUNT);
        v.put(CalendarContract.Calendars.CALENDAR_COLOR, 0xFF7A3E1D);
        v.put(CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL, CalendarContract.Calendars.CAL_ACCESS_OWNER);
        v.put(CalendarContract.Calendars.OWNER_ACCOUNT, LOCAL_ACCOUNT);
        v.put(CalendarContract.Calendars.VISIBLE, 1);
        v.put(CalendarContract.Calendars.SYNC_EVENTS, 1);
        v.put(CalendarContract.Calendars.CALENDAR_TIME_ZONE, TimeZone.getDefault().getID());
        Uri created = cr.insert(uri, v);
        return created == null ? -1 : ContentUris.parseId(created);
    }

    private String calendarName(ContentResolver cr, long id) {
        try (Cursor c = cr.query(ContentUris.withAppendedId(CalendarContract.Calendars.CONTENT_URI, id),
                new String[] { CalendarContract.Calendars.CALENDAR_DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        }
        return "";
    }
}
