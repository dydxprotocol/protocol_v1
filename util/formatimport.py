#!/usr/bin/env python

import sys
import string
import os
import glob
import copy

# overwrite a single file, fixing the import lines
def lintImports(dir, filepath):
    itHasStarted = False
    intoCodeSection = False
    preLines = []
    importLines = []
    postLines = []
    # parse entire file
    for line in open(filepath, 'r').readlines():
        if (not intoCodeSection and line.lstrip().startswith('import')):
            itHasStarted = True
            importLines.append(line.lstrip().split(" "))
        else:
            if (line.startswith('contract') or line.startswith('library')):
                intoCodeSection = True
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
        key = lambda l:(
            l[5][1] == '.',
            os.path.dirname(l[5]),
            os.path.basename(l[5])
    )
    )

    if sortedImportLines != ogImportLines:
        niceFilePath = filepath.replace(dir, "protocol")
        if "fix" in sys.argv:
            print("modified " + niceFilePath)
            with open(filepath, 'w') as output:
                output.writelines(preLines)
                output.writelines(" ".join(line) for line in sortedImportLines)
                output.writelines(postLines)
        else:
            print("\nin file '" + niceFilePath +"':\n")
            print "".join([" ".join(x) for x in ogImportLines])
            print("\t>>> SHOULD BE >>>\n")
            print "".join([" ".join(x) for x in sortedImportLines])
            print ""
        return False
    return True


def lintCommentHeader(dir, filepath, solidityVersion):
    fileName = os.path.basename(filepath)
    strippedFileName = fileName.split(".sol")[0]
    titleLine = " * @title " + strippedFileName + "\n"
    authorLine = " * @author dYdX\n"
    blankLine = " *\n"
    solidityLine = "pragma solidity " + solidityVersion + ";\n"
    allLines = open(filepath, 'r').readlines()

    everythingOkay = True
    if titleLine not in allLines:
        print "No title (or incorrect title) line in " + fileName
        everythingOkay = False
    if authorLine not in allLines:
        print "No author (or incorrect author) line in " + fileName
        everythingOkay = False
    if blankLine not in allLines:
        print "Unlikely to be a proper file-level comment in " + fileName
        everythingOkay = False
    if solidityLine != allLines[0]:
        print "Unlikely to be using solidity version " + solidityVersion + " in " + fileName
        everythingOkay = False

    return everythingOkay


def main():
    files = []
    start_dir = os.getcwd()
    pattern   = "*.sol"

    dir_path = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))

    for dir,_,_ in os.walk(dir_path+"/contracts"):
        files.extend(glob.glob(os.path.join(dir,pattern)))

    whitelistedFiles = [
        "contracts/0x",
        "contracts/interfaces",
        "Migrations.sol",
        "/Test",
        "/test"
    ]
    files = [x for x in files if not any(white in x for white in whitelistedFiles)]

    everythingOkay = True
    for file in files:
        everythingOkay &= lintImports(dir_path, file)
        everythingOkay &= lintCommentHeader(dir_path, file,"0.4.21")

    if everythingOkay:
        print "No 'import' issues found."

    return everythingOkay


if __name__ == "__main__":
    main()
