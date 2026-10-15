# Rebuilds data/icd10cm/icd10cm-<year>.tsv.gz, the ICD-10-CM code table the app checks
# and searches diagnosis codes against. Source: the CDC/NCHS ICD-10-CM tabular list
# (public domain), as packaged by the simple-icd-10-cm library (MIT).
#
#   python3 -m pip download --no-deps simple-icd-10-cm -d /tmp/icd && unzip -o /tmp/icd/*.whl -d /tmp/icd
#   python3 -I scripts/icd10cm-build.py /tmp/icd data/icd10cm/icd10cm-2026.tsv
#   gzip -9 -f data/icd10cm/icd10cm-2026.tsv
#
# One line per category and code: code (with dot) <TAB> 1 if billable (a full code,
# nothing more specific under it) else 0 <TAB> official description.
import sys

sys.path.insert(0, sys.argv[1])
import simple_icd_10_cm as cm

with open(sys.argv[2], "w") as out:
    for c in cm.get_all_codes(with_dots=True):
        if not cm.is_category_or_subcategory(c) and not cm.is_extended_subcategory(c):
            continue
        d = cm.get_description(c).replace("\t", " ").replace("\n", " ")
        out.write(f"{c}\t{1 if cm.is_leaf(c) else 0}\t{d}\n")
