package ru.ulportal.app;

import java.util.Map;
import org.junit.Test;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

public class PortalAlertsTest {
    private static String row(int id, String grade) {
        return "<tr><td><a href=\"https://portal.ulsu.ru/course/user.php?mode=grade&amp;id=" + id +
                "\">Дисциплина</a></td><td><span>" + grade + "</span></td><td>—</td></tr>";
    }

    private static String table(String rows) {
        return "<table id=\"overview-grade\"><tbody>" + rows + "</tbody></table>";
    }

    @Test
    public void gradeOverviewDistinguishesMissingPageAndUngradedCourse() {
        assertEquals(Map.of("19", "10.5", "7", "", "36", "Зачтено", "37", "10.5 (52.5%)"),
                PortalAlerts.courseGrades(table(row(19, "&nbsp;10,50&nbsp;") + row(7, "&mdash;") + row(36, "Зачтено") + row(37, "10,50 (52,50 %)"))));
        assertEquals(Map.of(), PortalAlerts.courseGrades(table("<tr class=\"emptyrow\"><td>No grades</td></tr>")));
        assertNull(PortalAlerts.courseGrades("<form id=\"login\"></form>"));
        assertNull(PortalAlerts.courseGrades(table(row(19, "<svg onload=\"x()\">not a grade</svg>"))));
    }

    @Test
    public void onlyKnownGradeChangesNotify() {
        assertEquals(0, PortalAlerts.changedGrades(Map.of(), Map.of("19", "10.5")));
        assertEquals(1, PortalAlerts.changedGrades(Map.of("19", "10.5", "7", ""), Map.of("19", "10.5", "7", "4", "21", "10")));
        assertEquals(1, PortalAlerts.changedGrades(Map.of("19", "10.5"), Map.of("19", "")));
        assertEquals(0, PortalAlerts.changedGrades(Map.of("19", "10.5"), Map.of()));
    }

    @Test
    public void deadlineKeysHaveAnActionableWindowAndIncludeTheDueDate() {
        long now = 10000000;
        assertEquals("7:10000001", PortalAlerts.deadlineKey("7", now + 1, now, true));
        assertEquals("7:10000002", PortalAlerts.deadlineKey("7", now + 2, now, true));
        assertEquals("7:10086400", PortalAlerts.deadlineKey("7", now + PortalAlerts.DAY, now, true));
        assertNull(PortalAlerts.deadlineKey("7", now + PortalAlerts.DAY + 1, now, true));
        assertNull(PortalAlerts.deadlineKey("7", now, now, true));
        assertNull(PortalAlerts.deadlineKey("7", now + 1, now, false));
    }
}
