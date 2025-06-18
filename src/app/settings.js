/* ─────────────────────────────────────────
   settings.js – simple “Edit my name” page
   ───────────────────────────────────────── */
import { useState, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";

const NAME_KEY = "userName";

export default function Settings() {
  const router = useRouter();
  const [nameInput, setNameInput] = useState("");

  /* load current name once */
  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem(NAME_KEY);
      if (stored) setNameInput(stored);
    })();
  }, []);

  /* save handler */
  const saveName = async () => {
    const v = nameInput.trim();
    if (!v) {
      Alert.alert("Name required", "Please enter a name first.");
      return;
    }
    await AsyncStorage.setItem(NAME_KEY, v);
    Alert.alert("Saved", "Your name has been updated.", [
      { text: "OK", onPress: () => router.back() },
    ]);
  };

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={{ fontSize: 24, fontWeight: "700", marginBottom: 20 }}>
        Settings
      </Text>

      <Text style={{ fontSize: 18, marginBottom: 8 }}>Your name</Text>
      <TextInput
        value={nameInput}
        onChangeText={setNameInput}
        placeholder="Enter your name"
        style={{
          borderWidth: 1,
          borderColor: "#ccc",
          borderRadius: 6,
          paddingHorizontal: 12,
          paddingVertical: 8,
          fontSize: 18,
        }}
        returnKeyType="done"
        onSubmitEditing={saveName}
      />

      {/* SAVE */}
      <TouchableOpacity
        onPress={saveName}
        style={{
          marginTop: 24,
          backgroundColor: "#34C759",
          paddingVertical: 12,
          borderRadius: 8,
          alignItems: "center",
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>
          Save
        </Text>
      </TouchableOpacity>

      {/* CANCEL */}
      <TouchableOpacity
        onPress={() => router.back()}
        style={{
          marginTop: 12,
          backgroundColor: "#aaa",
          paddingVertical: 12,
          borderRadius: 8,
          alignItems: "center",
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>
          Cancel
        </Text>
      </TouchableOpacity>
    </View>
  );
}
