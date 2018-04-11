#!/usr/bin/env python

import sys
import string
import os
import glob
import copy

# overwrite a single file, fixing the import lines
def fixImports(dir, filepath, dryRun):
    itHasStarted = False
    preLines = []
    importLines = []
    postLines = []
    # parse entire file
    for line in open(filepath, 'r').readlines():
        if (line.startswith('import')):
            itHasStarted = True
            importLines.append(line.split(" "))
        else:
            if not itHasStarted:
                preLines.append(line)
            else:
                postLines.append(line)

    # remove unused import lines
    ogImportLines = copy.deepcopy(importLines);
    importLines = [x for x in importLines if any(x[2] in line for line in postLines)]

    # remove duplicate import lines
    temp = set()
    importLines = [x for x in importLines if x[2] not in temp and (temp.add(x[2]) or True)]

    # sort import lines
    sortedImportLines = []
    for line in importLines:
        sortedImportLines.append(line)
    sortedImportLines = sorted(
        sortedImportLines,
        key = lambda l:(os.path.dirname(l[5]),
        os.path.basename(l[5]))
    )

    if sortedImportLines != ogImportLines:
        niceFilePath = filepath.replace(dir, "protocol")
        if dryRun:
            print("\nin file '" + niceFilePath +"':\n")
            print "".join([" ".join(x) for x in ogImportLines])
            print("\t>>> SHOULD BE >>>\n")
            print "".join([" ".join(x) for x in sortedImportLines])
            print ""
        else:
            print("modified " + niceFilePath)
            with open(filepath, 'w') as output:
                output.writelines(preLines)
                output.writelines(" ".join(line) for line in sortedImportLines)
                output.writelines(postLines)
        return False
    return True


def main():
    files = []
    start_dir = os.getcwd()
    pattern   = "*.sol"

    dir_path = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))

    for dir,_,_ in os.walk(dir_path+"/contracts"):
        files.extend(glob.glob(os.path.join(dir,pattern)))
    files = [x for x in files if "contracts/0x" not in x and "contracts/interfaces" not in x]

    everythingOkay = True
    for file in files:
        everythingOkay = everythingOkay and fixImports(dir_path, file, "dry" in sys.argv)

    if everythingOkay:
        print "No 'import' issues found."

    return everythingOkay


if __name__ == "__main__":
    main()
