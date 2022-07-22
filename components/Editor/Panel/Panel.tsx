import React, { useContext, useEffect, useState } from "react";
import {
  dataArrayElement,
  PixelDTO,
  rowColumnColor,
  PanelKeys,
} from "../../../const/CommonDTO";

import { PixelsContainer } from "./PixelsContainer";
import * as S from "./styles";
import { useDispatch, useSelector } from "react-redux";
import * as localHistoryRedux from "../../../store/modules/localHistory";
import { Pixel } from "./Pixel";
import { PixelBorder } from "./PixelBorder";
import { SizeControl } from "./SizeControl";
import { Client, Document } from "yorkie-js-sdk";
import { setReduxClient, setReduxDoc } from "../../../store/modules/docSlice";
import { RootState } from "../../../store/modules";
import { decodePixelId, modifyPixelById } from "../../../const/PixelFunctions";
import {
  appendToGroup,
  applyChangeToGroup,
  changeGroupColor,
  initializeGroup,
  removeFromGroup,
} from "../../../store/modules/colorGroupSlice";
import {
  AddColumnInterface,
  AddRowInterface,
  DeleteColumnInterface,
  DeleteRowInterface,
} from "./SizeControl/SizeControlProps";
import { initialize, pixelDataElement } from "../../../store/modules/pixelData";

interface Props {
  initialData: pixelDataElement[][];
  panelRef: React.RefObject<HTMLDivElement>;
  colorArray: dataArrayElement[];
  setColorArray: React.Dispatch<React.SetStateAction<dataArrayElement[]>>;
}

export interface Pixel2dRow {
  rowIndex: number;
  columns: Pixel2dPixel[];
}

export interface Pixel2dPixel {
  columnIndex: number;
  pixel: JSX.Element;
}

export enum Position {
  LEFT,
  RIGHT,
  TOP,
  BOTTOM,
}
const INITIAL_ROW_COUNT = 32;
const INITIAL_COLUMN_COUNT = 32;

const Panel: React.FC<Props> = ({
  initialData,
  panelRef,
  colorArray,
  setColorArray,
}) => {
  const doc = useSelector((state: RootState) => state.docSlice.doc);
  const client = useSelector((state: RootState) => state.docSlice.client);

  // const initialize = () => {
  //   const tempPixel2dArray: Pixel2dRow[] = [];
  //   initialData.map((row, rowIndex) => {
  //     const tempPixel2dArrayRow: Pixel2dPixel[] = [];
  //     row.map((pixel, columnIndex) => {
  //       tempPixel2dArrayRow.push({
  //         columnIndex: columnIndex,
  //         pixel: (
  //           <Pixel
  //             key={`row${rowIndex}column${columnIndex}`}
  //             id={`row${rowIndex}column${columnIndex}`}
  //             rowIndex={rowIndex}
  //             columnIndex={columnIndex}
  //             dataColor={pixel.color}
  //             dataName={pixel.name}
  //           ></Pixel>
  //         ),
  //       });
  //     });
  //     tempPixel2dArray.push({
  //       rowIndex: rowIndex,
  //       columns: tempPixel2dArrayRow,
  //     });
  //   });
  //   setPixel2dArray(tempPixel2dArray);
  // };

  useEffect(() => {
    const activate = async () => {
      const yorkie = await import("yorkie-js-sdk");
      const client = new yorkie.Client("http://localhost:8080");
      await client.activate();

      dispatch(setReduxClient(client));

      const doc = new yorkie.Document<any>("dotting");
      await client.attach(doc);
      dispatch(setReduxDoc(doc));
      doc.update((root) => {
        console.log("useEffect updated");

        if (!root.dataArray) {
          root.dataArray = {};
          for (let i = 0; i < INITIAL_ROW_COUNT; i++) {
            root.dataArray[i] = {};
            for (let j = 0; j < INITIAL_COLUMN_COUNT; j++) {
              root.dataArray[i][j] = {};
              root.dataArray[i][j].name = undefined;
              root.dataArray[i][j].color = undefined;
            }
          }
        } else {
          //root.dataArray exists
          const tempPixel2dArray: Pixel2dRow[] = [];
          for (
            let i = root.laneKeys.rowStartKey;
            i < root.laneKeys.rowLastKey + 1;
            i++
          ) {
            const tempPixel2dArrayRow: Pixel2dPixel[] = [];
            for (
              let j = root.laneKeys.columnStartKey;
              j < root.laneKeys.columnLastKey + 1;
              j++
            ) {
              const dataColor = root.dataArray[i] && root.dataArray[i][j].color;
              const dataName = root.dataArray[i] && root.dataArray[i][j].name;
              tempPixel2dArrayRow.push({
                columnIndex: j,
                pixel: (
                  <Pixel
                    key={`row${i}column${j}`}
                    id={`row${i}column${j}`}
                    rowIndex={i}
                    columnIndex={j}
                    dataColor={dataColor}
                    dataName={dataName}
                  ></Pixel>
                ),
              });
              if (dataName) {
                dispatch(
                  appendToGroup({
                    key: dataName,
                    data: [
                      {
                        rowIndex: i,
                        columnIndex: j,
                        color: dataColor,
                        name: dataName,
                      },
                    ],
                  })
                );
              }
            }
            tempPixel2dArray.push({
              rowIndex: i,
              columns: tempPixel2dArrayRow,
            });
          }
          setPixel2dArray(tempPixel2dArray);
        }
        if (!root.laneKeys) {
          root.laneKeys = {
            prev_rowStartKey: 0,
            rowStartKey: 0,
            prev_rowLastKey: INITIAL_ROW_COUNT - 1,
            rowLastKey: INITIAL_ROW_COUNT - 1,
            prev_columnStartKey: 0,
            columnStartKey: 0,
            prev_columnLastKey: INITIAL_COLUMN_COUNT - 1,
            columnLastKey: INITIAL_COLUMN_COUNT - 1,
          };
        }
      });

      doc.subscribe((event) => {
        if (event.type === "local-change") {
          // console.log("local evetn", event);
          // console.log("local event value: ", event.value);
        } else if (event.type === "remote-change") {
          for (const changeInfo of event.value) {
            // console.log(changeInfo.change);
            for (const path of changeInfo.paths) {
              console.log("all paths: ", path);
              if (path.startsWith(`$.dataArray`)) {
                //dataArray is change
                const changePathArray = path.split(".");
                // if (changePathArray.length === 5) {
                const rowIndex = changePathArray[2];
                const columnIndex = changePathArray[3];
                const changeType = changePathArray[4];
                if (doc.getRoot().dataArray[rowIndex][columnIndex]) {
                  const newColor =
                    doc.getRoot().dataArray[rowIndex][columnIndex].color;
                  const newName =
                    doc.getRoot().dataArray[rowIndex][columnIndex].name;
                  if (changeType === "color") {
                    modifyPixelById({
                      rowIndex: Number(rowIndex),
                      columnIndex: Number(columnIndex),
                      color: newColor,
                      name: newName,
                    });
                    dispatch(
                      localHistoryRedux.checkPollution({
                        target: [
                          {
                            rowIndex: Number(rowIndex),
                            columnIndex: Number(columnIndex),
                            color: newColor,
                            name: newName,
                          },
                        ],
                      })
                    );
                  } else if (changeType === "name") {
                    if (newName) {
                      // dispatch(
                      //   removeFromGroup({
                      //     rowIndex: Number(rowIndex),
                      //     columnIndex: Number(columnIndex),
                      //   })
                      // );
                      dispatch(
                        appendToGroup({
                          key: newName,
                          data: [
                            {
                              rowIndex: Number(rowIndex),
                              columnIndex: Number(columnIndex),
                              color: newColor,
                              name: newName,
                            },
                          ],
                        })
                      );
                      dispatch(
                        changeGroupColor({ key: newName, color: newColor })
                      );
                    } else {
                      console.log(newName, "is empty!");
                      console.log(rowIndex, columnIndex);
                      //this is called when there is no newname
                      dispatch(
                        removeFromGroup({
                          rowIndex: Number(rowIndex),
                          columnIndex: Number(columnIndex),
                        })
                      );
                    }
                  }
                  // }
                }
              } else if (path.startsWith(`$.laneKeys`)) {
                const changePathArray = path.split(".");
                const changedPart = changePathArray[2];

                const rowStartKey = doc.getRoot().laneKeys.rowStartKey;
                const prevRowStartKey = doc.getRoot().laneKeys.prev_rowStartKey;
                const rowLastKey = doc.getRoot().laneKeys.rowLastKey;
                const prevRowLastKey = doc.getRoot().laneKeys.prev_rowLastKey;
                const columnStartKey = doc.getRoot().laneKeys.columnStartKey;
                const prevColumnStartKey =
                  doc.getRoot().laneKeys.prev_columnStartKey;
                const columnLastKey = doc.getRoot().laneKeys.columnLastKey;
                const prevColumnLastKey =
                  doc.getRoot().laneKeys.prev_columnLastKey;

                switch (changedPart) {
                  case "rowStartKey":
                    const topRowChangeAmount = rowStartKey - prevRowStartKey;
                    if (topRowChangeAmount > 0) {
                      deleteRow({
                        rowIndex: prevRowStartKey,
                        position: Position.TOP,
                      });
                      dispatch(removeFromGroup({ rowIndex: prevRowStartKey }));
                      doc.update((root) => {
                        root.laneKeys.prev_rowStartKey = prevRowStartKey + 1;
                      });
                    } else if (topRowChangeAmount < 0) {
                      addRow({
                        rowIndex: prevRowStartKey - 1,
                        position: Position.TOP,
                        data: [],
                      });
                      doc.update((root) => {
                        root.laneKeys.prev_rowStartKey = prevRowStartKey - 1;
                      });
                    }
                    break;
                  case "rowLastKey":
                    const bottomRowChangeAmount = rowLastKey - prevRowLastKey;
                    if (bottomRowChangeAmount > 0) {
                      addRow({
                        rowIndex: prevRowLastKey + 1,
                        position: Position.BOTTOM,
                        data: [],
                      });
                      doc.update((root) => {
                        root.laneKeys.prev_rowLastKey = prevRowLastKey + 1;
                      });
                    } else if (bottomRowChangeAmount < 0) {
                      deleteRow({
                        rowIndex: prevRowLastKey,
                        position: Position.BOTTOM,
                      });
                      dispatch(removeFromGroup({ rowIndex: prevRowLastKey }));
                      doc.update((root) => {
                        root.laneKeys.prev_rowLastKey = prevRowLastKey - 1;
                      });
                    }
                    break;
                  case "columnStartKey":
                    const leftColumnChangeAmount =
                      columnStartKey - prevColumnStartKey;
                    if (leftColumnChangeAmount > 0) {
                      deleteColumn({
                        columnIndex: prevColumnStartKey,
                        position: Position.LEFT,
                      });
                      dispatch(
                        removeFromGroup({ columnIndex: prevColumnStartKey })
                      );
                      doc.update((root) => {
                        root.laneKeys.prev_columnStartKey =
                          prevColumnStartKey + 1;
                      });
                    } else if (leftColumnChangeAmount < 0) {
                      addColumn({
                        columnIndex: prevColumnStartKey - 1,
                        position: Position.LEFT,
                        data: [],
                      });
                      doc.update((root) => {
                        root.laneKeys.prev_columnStartKey =
                          prevColumnStartKey - 1;
                      });
                    }
                    break;
                  case "columnLastKey":
                    const rightColumnChangeAmount =
                      columnLastKey - prevColumnLastKey;
                    if (rightColumnChangeAmount > 0) {
                      addColumn({
                        columnIndex: prevColumnLastKey + 1,
                        position: Position.RIGHT,
                        data: [],
                      });
                      doc.update((root) => {
                        root.laneKeys.prev_columnLastKey =
                          prevColumnLastKey + 1;
                      });
                    } else if (rightColumnChangeAmount < 0) {
                      deleteColumn({
                        columnIndex: prevColumnLastKey,
                        position: Position.RIGHT,
                      });
                      dispatch(
                        removeFromGroup({ columnIndex: prevColumnLastKey })
                      );
                      doc.update((root) => {
                        root.laneKeys.prev_columnLastKey =
                          prevColumnLastKey - 1;
                      });
                    }
                    break;
                }
              }
            }
          }
        }
      });

      // });
    };

    activate();
  }, []);

  console.log("panel rendered");
  const dispatch = useDispatch();
  const [pixel2dArray, setPixel2dArray] = useState<Pixel2dRow[]>([]);

  const resetDoc = () => {
    const tempPixel2dArray: Pixel2dRow[] = [];
    doc?.update((root) => {
      root.laneKeys.rowStartKey = 0;
      root.laneKeys.prevRowStartKey = 0;
      root.laneKeys.rowLastKey = 31;
      root.laneKeys.prevRowLastKey = 31;
      root.laneKeys.columnStartKey = 0;
      root.laneKeys.prevColumnStartKey = 0;
      root.laneKeys.columnLastKey = 31;
      root.laneKeys.prevColumnLastKey = 31;

      for (
        let i = root.laneKeys.rowStartKey;
        i < root.laneKeys.rowLastKey + 1;
        i++
      ) {
        const tempPixel2dArrayRow: Pixel2dPixel[] = [];
        for (
          let j = root.laneKeys.columnStartKey;
          j < root.laneKeys.columnLastKey + 1;
          j++
        ) {
          root.dataArray[i][j].color = undefined;
          root.dataArray[i][j].name = undefined;
          tempPixel2dArrayRow.push({
            columnIndex: j,
            pixel: (
              <Pixel
                key={`row${i}column${j}`}
                id={`row${i}column${j}`}
                rowIndex={i}
                columnIndex={j}
                dataColor={undefined}
                dataName={undefined}
              ></Pixel>
            ),
          });
        }
        tempPixel2dArray.push({ rowIndex: i, columns: tempPixel2dArrayRow });
      }
      setPixel2dArray(tempPixel2dArray);
      dispatch(initializeGroup());
      // dispatch(initialize({data: tempPixel2dArray}));
    });
  };

  function appendBehind<Type>(element: Type, array: Type[]): Type[] {
    return [...array, element];
  }

  function appendBefore<Type>(element: Type, array: Type[]): Type[] {
    return [element, ...array];
  }

  const addColumn = ({ columnIndex, position, data }: AddColumnInterface) => {
    const newColumnIndex = columnIndex;
    let dataIndex = 0;
    setPixel2dArray((previous) => {
      return previous.map((previousRow) => {
        const key = `row${previousRow.rowIndex}column${newColumnIndex}`;
        const newColumn: Pixel2dPixel = {
          columnIndex: newColumnIndex,
          pixel: (
            <Pixel
              key={key}
              id={key}
              rowIndex={previousRow.rowIndex}
              columnIndex={newColumnIndex}
              dataColor={data[dataIndex]?.color}
              dataName={data[dataIndex]?.name}
            />
          ),
        };
        const changedColumns =
          position === Position.LEFT
            ? appendBefore(newColumn, previousRow.columns)
            : appendBehind(newColumn, previousRow.columns);
        return {
          rowIndex: previousRow.rowIndex,
          columns: changedColumns,
        };
      });
    });
  };

  const addRow = ({ rowIndex, position, data }: AddRowInterface) => {
    const newRowIndex = rowIndex;
    //apply changes to pixels
    setPixel2dArray((previous) => {
      const columns = previous[0].columns;
      const columnFirstKey = columns[0].columnIndex;
      const columnEndKey = columns[columns.length - 1].columnIndex;
      const newRowColumns: Pixel2dPixel[] = [];
      let dataIndex = 0;
      for (let i = columnFirstKey; i < columnEndKey + 1; i++) {
        const key = `row${newRowIndex}column${i}`;
        newRowColumns.push({
          columnIndex: i,
          pixel: (
            <Pixel
              key={key}
              id={key}
              rowIndex={newRowIndex}
              columnIndex={i}
              dataColor={data[dataIndex]?.color}
              dataName={data[dataIndex]?.name}
            />
          ),
        });
        dataIndex++;
      }

      if (position === Position.TOP) {
        return appendBefore(
          { rowIndex: newRowIndex, columns: newRowColumns },
          previous
        );
      } else {
        return appendBehind(
          { rowIndex: newRowIndex, columns: newRowColumns },
          previous
        );
      }
    });
  };

  const deleteColumn = ({ columnIndex, position }: DeleteColumnInterface) => {
    const columnIndexToDelete = columnIndex;
    setPixel2dArray((previous) => {
      return previous.map((previousRow) => {
        console.log(previousRow);
        return {
          rowIndex: previousRow.rowIndex,
          columns: previousRow.columns.filter((element) => {
            return element.columnIndex !== columnIndexToDelete;
          }),
        };
      });
    });
  };

  const deleteRow = ({ rowIndex, position }: DeleteRowInterface) => {
    const rowIndexToDelete = rowIndex;
    setPixel2dArray((previous) => {
      return previous.filter((row) => {
        return row.rowIndex !== rowIndexToDelete;
      });
    });
  };

  // useEffect(() => {
  //   initialize();
  // }, [initialData]);

  if (!doc || !client) {
    return null;
  }

  return (
    <S.Container>
      <S.ResetButton onClick={resetDoc}>Reset</S.ResetButton>
      <div>
        <button
          onClick={() => {
            dispatch(localHistoryRedux.undo());
          }}
        >
          back
        </button>
        <button
          onClick={() => {
            dispatch(localHistoryRedux.redo());
          }}
        >
          forward
        </button>
      </div>
      <S.PixelsCanvasContainer>
        <SizeControl
          addRow={addRow}
          addColumn={addColumn}
          deleteRow={deleteRow}
          deleteColumn={deleteColumn}
          pixel2dArray={pixel2dArray}
        >
          <PixelsContainer
            doc={doc}
            client={client}
            panelRef={panelRef}
            pixel2dArray={pixel2dArray}
            addColumn={addColumn}
            addRow={addRow}
            deleteColumn={deleteColumn}
            deleteRow={deleteRow}
          />
          <div style={{ position: "absolute", pointerEvents: "none" }}>
            {pixel2dArray.map((row) => {
              return (
                <div style={{ display: "flex" }} key={`row${row.rowIndex}`}>
                  {row.columns.map((element) => {
                    return (
                      <PixelBorder
                        key={`row${row.rowIndex}column${element.columnIndex}`}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </SizeControl>
      </S.PixelsCanvasContainer>
    </S.Container>
  );
};

export default Panel;
