#!/usr/bin/env python

import string
import os
import os.path
import glob


def fixImports(filepath):
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
    importLines = [x for x in importLines if any(x[2] in line for line in postLines)]

    # remove duplicate import lines
    temp = set()
    importLines = [x for x in importLines if x[2] not in temp and (temp.add(x[2] or True))]

    # sort import lines
    sortedImportLines = []
    for line in importLines:
        sortedImportLines.append(line)
    sortedImportLines = sorted(
        set(sortedImportLines),
        key = lambda l:(os.path.dirname(l[5]),
        os.path.basename(l[5]))
    )

    if sortedImportLines != importLines:
        print(filepath.replace(dir_path, "protocol") + " modified")

    with open(filepath, 'w') as output:
        output.writelines(preLines)
        output.writelines(" ".join(line) for line in sortedImportLines)
        output.writelines(postLines)

files = []
start_dir = os.getcwd()
pattern   = "*.sol"

dir_path = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))

for dir,_,_ in os.walk(dir_path+"/contracts"):
    files.extend(glob.glob(os.path.join(dir,pattern)))
files = [x for x in files if "contracts/0x" not in x and "contracts/interfaces" not in x]

for file in files:
    fixImports(file)
