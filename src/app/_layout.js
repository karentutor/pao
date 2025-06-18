import { GestureHandlerRootView } from "react-native-gesture-handler";
import { View, Text, TouchableOpacity } from "react-native";
import { Slot, Link, usePathname } from "expo-router";
import attemptExit from "../utils/attemptExit";     // <-- NEW

/* ---------- Brand header with left‑justified Exit ---------- */
const BrandBar = () => (
  <View
    style={{
      backgroundColor: "#1a2a40",         // navy
      flexDirection: "row",
      alignItems: "center",
      paddingTop: 30,                     // push content down from notch
      paddingBottom: 15,
      paddingHorizontal: 10,
      width: "100%",
    }}
  >
    {/* Exit on the far left */}
    <TouchableOpacity
      onPress={attemptExit}
      style={{
        paddingVertical: 4,
        paddingHorizontal: 12,
        backgroundColor: "#ff3b30",
        borderRadius: 6,
      }}
    >
      <Text style={{ color: "#fff", fontWeight: "600" }}>Exit</Text>
    </TouchableOpacity>

    {/* Title centred (use flex to push to centre) */}
    <Text
      style={{
        flex: 1,
        textAlign: "center",
        fontSize: 24,
        fontWeight: "800",
        color: "#FFD700",
        marginRight: 42, // width roughly equal to Exit button for perfect centring
      }}
    >
      mypao
    </Text>
  </View>
);

/* ---------- Bottom snackbar ---------- */
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
