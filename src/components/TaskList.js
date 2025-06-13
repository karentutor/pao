/* -----------------------------------------------------------------
   TaskList.js – shows tasks relevant to selectedDate; tap to toggle
   ----------------------------------------------------------------- */
import React from "react";
import { View, Text, TouchableOpacity } from "react-native";

/**
 * @param {{
 *   date: Date,
 *   tasks: {id:number,title:string,description:string,dueDate:string,completed:boolean}[],
 *   onToggle:(id:number)=>void
 * }} props
 */
export default function TaskList({ date, tasks, onToggle }) {
  /* show every INCOMPLETE task whose dueDate >= selectedDate */
  const d0 = new Date(date).setHours(0,0,0,0);
  const visible = tasks.filter(t=>{
    if(t.completed) return false;
    const due = new Date(t.dueDate).setHours(0,0,0,0);
    return d0<=due;                       // visible from now until due date
  });

  if(visible.length===0){
    return <Text style={{fontStyle:"italic"}}>No tasks for this day.</Text>;
  }

  return (
    <View>
      {visible.map(t=>(
        <TouchableOpacity key={t.id} onPress={()=>onToggle(t.id)}
          style={{padding:8,borderWidth:1,borderRadius:6,marginBottom:6,
                  backgroundColor:"#fff8dc"}}>
          <Text style={{fontWeight:"600"}}>{t.title}</Text>
          <Text>{t.description}</Text>
          <Text style={{fontSize:12,marginTop:2}}>
            Due {new Date(t.dueDate).toLocaleDateString()}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
