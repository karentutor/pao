import { GestureHandlerRootView } from "react-native-gesture-handler";
import { View, Text, TouchableOpacity } from "react-native";
import { Slot, Link, usePathname } from "expo-router";
import attemptExit from "../utils/attemptExit";

/* ---------- Brand header ---------- */
const BrandBar = () => {
  const path = usePathname();
  const onTaskPage = path.startsWith("/task");

  return (
    <View
      style={{
        backgroundColor: "#1a2a40",
        flexDirection: "row",
        alignItems: "center",
        paddingTop: 30,
        paddingBottom: 15,
        paddingHorizontal: 10,
        width: "100%",
      }}
    >
      {/* Exit hidden when on /task */}
      {!onTaskPage && (
        <TouchableOpacity
          onPress={attemptExit}
          style={{
            paddingVertical: 4,
            paddingHorizontal: 12,
            backgroundColor: "#ff3b30",
            borderRadius: 6,
            minWidth: 70,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "600" }}>Exit</Text>
        </TouchableOpacity>
      )}

      {/* Title */}
      <Text
        style={{
          flex: 1,
          textAlign: "center",
          fontSize: 24,
          fontWeight: "800",
          color: "#FFD700",
        }}
      >
        mypao
      </Text>

      {/* Settings gear always shown */}
      <Link href="/settings" asChild>
        <TouchableOpacity
          style={{
            paddingVertical: 4,
            paddingHorizontal: 12,
            minWidth: 70,
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: 20, color: "#FFD700" }}>⚙️</Text>
        </TouchableOpacity>
      </Link>
    </View>
  );
};

/* ---------- Bottom snackbar (unchanged) ---------- */
const BottomBar = () => {
  const path = usePathname();
  const is   = (p) => path.startsWith(p);

  const Btn = ({ href, label, align }) => (
    <Link href={href} asChild>
      <Text
        style={{
          flex: 1,
          textAlign: align,
          fontSize: 16,
          fontWeight: "600",
          color: is(href) ? "#007AFF" : "#000",
        }}
      >
        {label}
      </Text>
    </Link>
  );

  return (
    <View
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        flexDirection: "row",
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderTopWidth: 1,
        borderColor: "#ccc",
        backgroundColor: "#FFD700",
      }}
    >
      <Btn href="/calendar" label="Calendar" align="left" />
      <Btn href="/my-day"   label="My Day"   align="center" />
      <Btn href="/task"     label="Tasks"    align="right" />
    </View>
  );
};

/* ---------- Root layout ---------- */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BrandBar />
      <Slot />
      <BottomBar />
    </GestureHandlerRootView>
  );
}
