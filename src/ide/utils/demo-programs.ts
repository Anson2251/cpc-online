export const starterProgram = `
DECLARE message : STRING
message <- "Hello from vibe-cpc"
OUTPUT message
`.trim();

export const debuggerDemoProgram = `
// ============================================================
// Binary Search (Recursive) – Hybrid Debugger Tutorial
//
// INSTRUCTIONS BEFORE RUNNING:
//   - Click 'Debug' button (top-right).
//   - DO NOT add any breakpoints yet – the DEBUGGER lines will pause automatically.
//   - Follow the comments step by step.
//   - At the marked spots, you will be told to ADD a breakpoint manually.
// ============================================================

FUNCTION BinarySearch(values : ARRAY[1:10] OF INTEGER, left : INTEGER, right : INTEGER, target : INTEGER) RETURNS INTEGER
  DECLARE mid : INTEGER

  // ========== AUTOMATIC PAUSE 1 (DEBUGGER) ==========
  // The program stops here automatically.
  // Inspect the call stack and variables (left, right, target).
  // Then click "Continue".
  DEBUGGER

  IF left > right THEN
    RETURN -1
  ENDIF

  mid <- (left + right) DIV 2

  // ========== AUTOMATIC PAUSE 2 (DEBUGGER) ==========
  // Now you see mid and values[mid]. Compare with target.
  // Then click "Continue".
  DEBUGGER

  IF values[mid] = target THEN
    // ★ MANUAL BREAKPOINT CHALLENGE 1:
    //    Click on the line number of this RETURN statement to add a breakpoint.
    //    This will pause when the algorithm finds the target.
    //    After adding it, click "Continue" – the program will pause here if found.
    RETURN mid
  ENDIF

  IF target < values[mid] THEN
    // ========== AUTOMATIC PAUSE 3A (DEBUGGER) ==========
    // Before going left. Now you have a choice:
    //   - Click "Step Into" to enter the recursive call and see the next level.
    //   - Or click "Continue" to go directly to the next DEBUGGER in the recursive call.
    DEBUGGER
    RETURN BinarySearch(values, left, mid - 1, target)
  ELSE
    // ========== AUTOMATIC PAUSE 3B (DEBUGGER) ==========
    // Before going right. Same instruction: try "Step Into" here.
    DEBUGGER
    RETURN BinarySearch(values, mid + 1, right, target)
  ENDIF
ENDFUNCTION

// Main program
DECLARE data : ARRAY[1:10] OF INTEGER
DECLARE target : INTEGER
DECLARE resultIndex : INTEGER
DECLARE i : INTEGER

FOR i <- 1 TO 10
  data[i] <- i * 5
NEXT i

OUTPUT "Sorted array (step 5):"
FOR i <- 1 TO 10
  OUTPUT data[i]
NEXT i

OUTPUT "Enter target value:"
INPUT target

// ★ MANUAL BREAKPOINT CHALLENGE 2:
//    Click on the line number of this function call (resultIndex <- BinarySearch...)
//    Add a breakpoint there. Then when you run, the program will pause BEFORE
//    entering BinarySearch. Inspect the array and target first.
resultIndex <- BinarySearch(data, 1, 10, target)

IF resultIndex = -1 THEN
  OUTPUT "Target not found"
ELSE
  OUTPUT "Target found at index: ", resultIndex
ENDIF

// ★ MANUAL BREAKPOINT CHALLENGE 3:
//    Add a breakpoint on the line after this ENDIF (or the last OUTPUT line).
//    This lets you see the final result before the program exits.
`.trim();
