package ru.ulportal.app;

import java.util.List;
import org.junit.Test;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

public class ScheduleWidgetTest {
    private final ScheduleWidget.Lesson first = new ScheduleWidget.Lesson(100, "Algorithms", "101");
    private final ScheduleWidget.Lesson second = new ScheduleWidget.Lesson(250, "Databases", "");

    @Test
    public void selectsTheNextClassFromUnsortedSavedData() {
        assertEquals(first, ScheduleWidget.nextLesson(List.of(second, first), 99, 300));
        assertEquals(second, ScheduleWidget.nextLesson(List.of(second, first), 100, 300));
        assertEquals(second, ScheduleWidget.nextLesson(List.of(first, second), 249, 300));
        assertNull(ScheduleWidget.nextLesson(List.of(first, second), 250, 300));
    }

    @Test
    public void ignoresClassesOutsideThePublishedDatesAndExpiredSnapshots() {
        assertNull(ScheduleWidget.nextLesson(List.of(first, second), 100, 250));
        assertNull(ScheduleWidget.nextLesson(List.of(first, second), 300, 300));
        assertNull(ScheduleWidget.nextLesson(List.of(), 100, 300));
    }
}
