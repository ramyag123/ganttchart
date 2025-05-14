import * as React from "react";
import { IInputs } from "../generated/ManifestTypes";
import { useState, useEffect, useRef } from "react";
import {
  GanttComponent,
  Inject,
  Edit,
  Filter,
  Sort,
  Selection,
  ActionBeginArgs,
  IGanttData,
  ColumnDirective,
  ColumnsDirective
} from "@syncfusion/ej2-react-gantt";
import "../App.css";
import { registerLicense } from "@syncfusion/ej2-base";
import { DropDownListComponent, ChangeEventArgs } from "@syncfusion/ej2-react-dropdowns";

export interface ExtendedGanttData extends IGanttData {
  Taskguid: string;
  TaskName: string;
  StartDate: string;
  EndDate: string;
  Duration: number;
  Progress: number;
  resourceInfo: string;
}
//let modifiedTasks: ExtendedGanttData[] = [];

registerLicense("Ngo9BigBOggjHTQxAR8/V1NDaF5cWWtCf1FpRmJGdld5fUVHYVZUTXxaS00DNHVRdkdnWH5fcnRURWZcVkF/V0E=");

interface Task {
  cr2eb_id: number;
  cr2eb_projecttasksid: string;
  cr2eb_name: string;
  cr2eb_duration: number;
  cr2eb_complete: number;
  cr2eb_resourcenames?: string;
  cr2eb_start: string;
  cr2eb_finish?: string;
  cr2eb_predecessors?: string;
  cr2eb_wbs?: string;
}

interface Resource {
  cr2eb_projectresourcesid: string;
  cr2eb_name: string;
  cr2eb_id: number;
}

interface TransformedTask {
  TaskID: number;
  Taskguid: string;
  TaskName: string;
  StartDate: Date;
  EndDate: Date | null;
  Duration: number;
  Progress: number;
  Predecessor?: string;
  resourceInfo: number[];
  WBS: string;
  children: TransformedTask[];
}

interface TaskUpdate {
  cr2eb_name?: string;
  cr2eb_start?: string;
  cr2eb_finish?: string;
  cr2eb_duration: number;
  cr2eb_complete: number;
  cr2eb_resourcenames?: string;
  cr2eb_predecessors?: string;
}

const API_URL = `${Xrm.Utility.getGlobalContext().getClientUrl()}/api/data/v9.1`;

const getProjectGuidFromUrl = (): string | null => {
  const url = window.location.href;
  return new URL(url).searchParams.get("id");
};

const Component1 = () => {
  const [taskData, setTaskData] = useState<TransformedTask[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [resourceMapping, setResourceMapping] = useState<Record<string, number>>({});
  const ganttRef = useRef<GanttComponent | null>(null);

  const [selectedColumn, setSelectedColumn] = useState<string | null>(null);
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);

  const allColumns: string[] = ['TaskID', 'TaskName', 'StartDate', 'EndDate', 'Duration', 'Progress'];

  const hideColumn = () => {
    if (selectedColumn && ganttRef.current) {
      ganttRef.current.hideColumn(selectedColumn);
      setHiddenColumns((prev) => [...prev, selectedColumn]);
    }
  };

  const showColumn = (column: string) => {
    if (ganttRef.current) {
      ganttRef.current.showColumn(column);
      setHiddenColumns((prev) => prev.filter(col => col !== column));
    }
  };

  const fetchResources = async (): Promise<Resource[]> => {
    const projectGuid = getProjectGuidFromUrl();
    if (!projectGuid) {
      console.error("Project GUID is missing from the URL.");
      return [];
    }

    const apiUrl = `${API_URL}/cr2eb_projectresourceses?$filter=_cr2eb_project_value eq ${encodeURIComponent(projectGuid)}`;

    try {
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "OData-MaxVersion": "4.0",
          "OData-Version": "4.0",
        },
      });

      if (!response.ok) throw new Error(`Error fetching resources: ${response.statusText}`);

      const data = await response.json();
      const fetchedResources: Resource[] = data.value.map((resource: Resource) => ({
        cr2eb_projectresourcesid: resource.cr2eb_projectresourcesid,
        cr2eb_name: resource.cr2eb_name,
        cr2eb_id: resource.cr2eb_id,
      }));

      const mapping: Record<string, number> = {};
      fetchedResources.forEach((res) => {
        mapping[res.cr2eb_projectresourcesid] = res.cr2eb_id;
      });

      setResourceMapping(mapping);
      setResources(fetchedResources);
      return fetchedResources;
    } catch (error) {
      console.error("Error fetching resources:", error);
      return [];
    }
  };

  const fetchProjectTasks = async (): Promise<Task[]> => {
    const projectGuid = getProjectGuidFromUrl();
    if (!projectGuid) {
      console.error("Project GUID is missing from the URL.");
      return [];
    }

    const apiUrl = `${API_URL}/cr2eb_projecttaskses?$filter=_cr2eb_project_value eq ${encodeURIComponent(projectGuid)}&$orderby=cr2eb_wbs asc`;

    try {
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "OData-MaxVersion": "4.0",
          "OData-Version": "4.0",
        },
      });

      if (!response.ok) throw new Error(`Error fetching tasks: ${response.statusText}`);

      const data = await response.json();
      return data.value as Task[];
    } catch (error) {
      console.error("Error fetching project tasks:", error);
      return [];
    }
  };

  const transformTasks = (tasks: Task[], fetchedResources: Resource[]): TransformedTask[] => {
    const taskMap = new Map<string, TransformedTask>();
    const resourceMap = Object.fromEntries(
      fetchedResources.map((res) => [res.cr2eb_projectresourcesid, res.cr2eb_id])
    );

    tasks.forEach((task) => {
      const resourceGuids = task.cr2eb_resourcenames?.split(",") || [];
      const resourceIds = resourceGuids
        .map((guid) => resourceMap[guid.trim()])
        .filter((id): id is number => id !== undefined);

      const transformedTask: TransformedTask = {
        TaskID: task.cr2eb_id,
        Taskguid: task.cr2eb_projecttasksid,
        TaskName: task.cr2eb_name,
        StartDate: new Date(task.cr2eb_start),
        EndDate: task.cr2eb_finish ? new Date(task.cr2eb_finish) : null,
        Duration: task.cr2eb_duration / 480,
        Progress: task.cr2eb_complete,
        Predecessor: task.cr2eb_predecessors,
        resourceInfo: resourceIds,
        WBS: task.cr2eb_wbs || "",
        children: [],
      };

      taskMap.set(task.cr2eb_projecttasksid, transformedTask);
    });

    const rootTasks: TransformedTask[] = [];
    taskMap.forEach((task) => {
      const parentWBS = task.WBS.split(".").slice(0, -1).join(".");
      const parentTask = Array.from(taskMap.values()).find((t) => t.WBS === parentWBS);

      if (parentTask) {
        parentTask.children.push(task);
      } else {
        rootTasks.push(task);
      }
    });

    return rootTasks;
  };

  const updateTaskInDataverse = async (taskId: string, updatedFields: Partial<Task>) => {
    const url = `${API_URL}/cr2eb_projecttaskses(${taskId})`;

    try {
      const response = await fetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "OData-MaxVersion": "4.0",
          "OData-Version": "4.0",
          Accept: "application/json",
        },
        body: JSON.stringify(updatedFields),
      });

      if (!response.ok) {
        throw new Error(`Failed to update task: ${response.statusText}`);
      }

      console.log("✅ Task updated successfully");
    } catch (error) {
      console.error("❌ Error updating task:", error);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      const fetchedResources = await fetchResources();
      const rawTasks = await fetchProjectTasks();
      setTaskData(transformTasks(rawTasks, fetchedResources));
    };

    fetchData();
  }, []);

  const taskFields = {
    id: "TaskID",
    name: "TaskName",
    startDate: "StartDate",
    endDate: "EndDate",
    duration: "Duration",
    progress: "Progress",
    child: "children",
    resourceInfo: "resourceInfo",
    dependency: 'Predecessor',
  };

  const resourceFields = {
    id: "cr2eb_id",
    name: "cr2eb_name",
  };

  return (
    <>
<div style={{ width: "500px", margin: "0 20px 10px 20px" }}>
<DropDownListComponent
          dataSource={allColumns.filter(col => !hiddenColumns.includes(col))}
          placeholder="Select column to hide"
          change={(e: ChangeEventArgs) => setSelectedColumn(e.value as string)}
        />
        <button onClick={hideColumn} style={{ marginLeft: 10 }}>Hide</button>
      </div>

      {hiddenColumns.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <h4>Hidden Columns</h4>
          <ul>
            {hiddenColumns.map((col) => (
              <li key={col}>
                {col} <button onClick={() => showColumn(col)}>Show</button>
              </li>
            ))}
          </ul>
        </div>
      )}
<div style={{ padding: "1rem" }}>

      <GanttComponent
        ref={ganttRef}
        dataSource={taskData}
        taskFields={taskFields}
        resources={resources}
        resourceFields={resourceFields}
        height="450px"
        taskMode = "Custom"
        editSettings={{
          allowEditing: true,
          allowAdding: true,
          allowDeleting: true,
          allowTaskbarEditing: true,
          mode: "Auto"
        }}
        actionComplete={async (args: ActionBeginArgs) => {
          if (args.requestType === "save") {
            const rawData = Array.isArray(args.data) ? args.data[0] : args.data;
            if (!rawData) return;

            const updatedData = rawData.taskData as ExtendedGanttData;
            console.log("updatedData:", updatedData);

            //alert("updatedData.Resources" + updatedData.resourceInfo);

            const resourceGuids: string = Array.isArray(updatedData.resourceInfo)
? updatedData.resourceInfo
.map((res) => res.cr2eb_projectresourcesid)
.filter((id): id is string => typeof id === "string")
.join(",")
: "";


//alert("resourceGuids" + resourceGuids);

            if (updatedData.Taskguid && updatedData.TaskName) {
              const fieldsToUpdate: TaskUpdate = {
                cr2eb_name: updatedData.TaskName,
                cr2eb_start: updatedData.StartDate,
                cr2eb_finish: updatedData.EndDate,
                cr2eb_duration: updatedData.Duration * 480,
                cr2eb_complete: updatedData.Progress,
                cr2eb_resourcenames: resourceGuids
              };

              await updateTaskInDataverse(updatedData.Taskguid, fieldsToUpdate);
            }
          }
        }}
      >
        <Inject services={[Edit, Filter, Sort, Selection]} />
      </GanttComponent>
      </div>
    </>
  );
};

export default Component1;
