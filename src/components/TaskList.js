/* -----------------------------------------------------------------
   TaskList.js – swipe to delete, checkbox to toggle complete
   ----------------------------------------------------------------- */
import React from "react";
import {
  View,
  Text,
  Pressable,
  Alert,
  LayoutAnimation,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";

/**
 * @param {{
 *   date: Date,
 *   tasks: {id:number,title:string,description:string,dueDate:Date,completed:boolean}[],
 *   onToggle:(id:number)=>void,
 *   onDelete:(id:number)=>void
 * }} props
 */
export default function TaskList({ date, tasks, onToggle, onDelete }) {
  /* show every task whose dueDate ≥ selectedDate  */
  const d0 = new Date(date).setHours(0, 0, 0, 0);
  const visible = tasks.filter((t) => {
    const due = new Date(t.dueDate).setHours(0, 0, 0, 0);
    return d0 <= due; // visible up to & incl. due‑date
  });

  if (visible.length === 0) {
    return (
      <Text style={{ fontStyle: "italic", marginTop: 4 }}>
        No tasks for this day.
      </Text>
    );
  }

  const renderRightActions = (id) => (
    <Pressable
      style={{
        justifyContent: "center",
        paddingHorizontal: 20,
        backgroundColor: "#ff3b30",
        flex: 1,
      }}
      onPress={() => {
        Alert.alert("Delete task", "Are you sure?", [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              LayoutAnimation.configureNext(
                LayoutAnimation.Presets.easeInEaseOut
              );
              onDelete(id);
            },
          },
        ]);
      }}
    >
      <Text style={{ color: "#fff", fontWeight: "600" }}>Delete</Text>
    </Pressable>
  );

  return (
    <View style={{ width: "100%" }}>
      {visible.map((t) => (
        <Swipeable
          key={t.id}
          renderRightActions={() => renderRightActions(t.id)}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              borderWidth: 1,
              padding: 8,
              borderRadius: 6,
              marginBottom: 6,
              backgroundColor: "#fff8dc",
            }}
          >
            {/* title & description */}
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text
                style={{
                  fontWeight: "600",
                  textDecorationLine: t.completed ? "line-through" : "none",
                }}
              >
                {t.title}
              </Text>
              <Text
                style={{
                  textDecorationLine: t.completed ? "line-through" : "none",
                }}
              >
                {t.description}
              </Text>
              <Text style={{ fontSize: 12, marginTop: 2 }}>
                Due {new Date(t.dueDate).toLocaleDateString()}
              </Text>
            </View>

            {/* checkbox */}
            <Pressable
              onPress={() => {
                LayoutAnimation.configureNext(
                  LayoutAnimation.Presets.easeInEaseOut
                );
                onToggle(t.id);
              }}
              style={{
                width: 24,
                height: 24,
                borderRadius: 4,
                borderWidth: 2,
                borderColor: "#555",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {t.completed && (
                <View
                  style={{
                    width: 12,
                    height: 12,
                    backgroundColor: "#34c759",
                  }}
                />
              )}
            </Pressable>
          </View>
        </Swipeable>
      ))}
    </View>
  );
}
